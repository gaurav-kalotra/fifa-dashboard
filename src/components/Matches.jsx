import { useMemo, useState, useEffect, useRef } from 'react'
import { ab, flagUrl, buildTeamStatusMap, computeGroups } from '../utils'

// WC2026 host city → 2-letter state/province/state code
const CITY_STATE = {
  'Arlington':'TX','Dallas':'TX','Houston':'TX','Frisco':'TX',
  'Los Angeles':'CA','Inglewood':'CA','Santa Clara':'CA','San Francisco':'CA',
  'East Rutherford':'NJ','New York':'NJ',
  'Seattle':'WA','Miami':'FL','Atlanta':'GA',
  'Foxborough':'MA','Boston':'MA',
  'Kansas City':'MO','Philadelphia':'PA','Glendale':'AZ',
  'Toronto':'ON','Vancouver':'BC',
  'Mexico City':'CDMX','Guadalajara':'JAL','Monterrey':'NL',
}

function appendState(venue) {
  if (!venue) return venue
  const city = Object.keys(CITY_STATE).find(c => venue.includes(c))
  if (!city) return venue
  const st = CITY_STATE[city]
  return venue.includes(st) ? venue : `${venue}, ${st}`
}

// ── FIFA (primary) ────────────────────────────────────────────
const FIFA_BASE      = 'https://api.fifa.com/api/v3'
const FIFA_COMP      = 17
const FIFA_SEASON    = '285023'
const FIFA_CALENDAR  = `${FIFA_BASE}/calendar/matches?idCompetition=${FIFA_COMP}&idSeason=${FIFA_SEASON}&language=en&count=500`
const FIFA_LIVE      = (s, m) => `${FIFA_BASE}/live/football/${FIFA_COMP}/${FIFA_SEASON}/${s}/${m}?language=en`
const FIFA_TIMELINE  = (s, m) => `${FIFA_BASE}/timelines/${FIFA_COMP}/${FIFA_SEASON}/${s}/${m}?language=en`
const FIFA_RANKINGS  = `${FIFA_BASE}/ranking/men?language=en`
const FIFA_POS_ABBR  = { 0:'GK', 1:'D', 2:'M', 3:'F' }

// ── ESPN (backup) ─────────────────────────────────────────────
const ESPN_BOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'
const ESPN_SUM   = id => `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${id}`

// ── Key helpers ───────────────────────────────────────────────
// Keys are sorted 3-letter abbreviations: "ARG|MEX"
function rawAbKey(a, b) { return [a.toUpperCase(), b.toUpperCase()].sort().join('|') }
function abKey(t1, t2)  { return rawAbKey(ab(t1) || t1.slice(0,3), ab(t2) || t2.slice(0,3)) }

// ── Event type sets (FIFA) ────────────────────────────────────
const FT_GOAL    = new Set([0, 15])   // goal, penalty
const FT_OWNGOAL = new Set([12])
const FT_YELLOW  = new Set([3, 65])
const FT_RED     = new Set([4, 5])

function classifyFifaEvt(type) {
  if (FT_OWNGOAL.has(type)) return 'goal'
  if (FT_GOAL.has(type))    return 'goal'
  if (FT_YELLOW.has(type))  return 'yellow'
  if (FT_RED.has(type))     return 'red'
  return null
}

// ── Parsers ───────────────────────────────────────────────────
function parseFifaEventsFromTeams(fd) {
  const out = []
  for (const [side, team] of [['home', fd?.HomeTeam], ['away', fd?.AwayTeam]]) {
    for (const ev of team?.Events || []) {
      const kind = classifyFifaEvt(ev.Type)
      if (!kind) continue
      out.push({ min: String(ev.MatchMinute ?? ''), type: kind, player: ev.PlayerName?.[0]?.Description || '', side })
    }
  }
  return out.sort((a, b) => (parseInt(a.min)||0) - (parseInt(b.min)||0))
}

function parseFifaTimeline(data) {
  const evts = data?.Event || data?.Events || []
  const out = []
  for (const ev of evts) {
    const kind = classifyFifaEvt(ev.Type)
    if (!kind) continue
    const hoa  = ev.HomeOrAway ?? ev.Team ?? ev.TeamSide ?? ''
    const hoaS = String(hoa).toLowerCase()
    const side = (hoa===1||hoaS==='home'||hoaS==='h') ? 'home'
               : (hoa===2||hoaS==='away'||hoaS==='a') ? 'away' : ''
    const player = ev.PlayerName?.[0]?.Description || ev.Player?.Name?.[0]?.Description
      || ev.NationalTeamPlayer?.PlayerName?.[0]?.Description || ''
    out.push({ min: String(ev.MatchMinute ?? ev.Minute ?? ''), type: kind, player, side })
  }
  return out.sort((a, b) => (parseInt(a.min)||0) - (parseInt(b.min)||0))
}

function parseFifaLineup(data) {
  const result = { home:[], away:[], homeCoach:'', awayCoach:'', homeFormation:'', awayFormation:'' }
  for (const [side, td] of [['home', data?.HomeTeam], ['away', data?.AwayTeam]]) {
    if (!td) continue
    const hc = (td.Coaches || []).find(c => c.Role === 1) || td.Coaches?.[0]
    const allP = td.Players || []
    const used = allP.filter(p => p.Status === 1)
    const players = (used.length > 0 ? used : allP.filter(p => p.Status <= 2).slice(0, 11)).map(p => ({
      id: p.IdPlayer, name: p.ShortName?.[0]?.Description || p.PlayerName?.[0]?.Description || '',
      jersey: String(p.ShirtNumber ?? ''), pos: FIFA_POS_ABBR[p.Position] || 'M',
      photo: p.PlayerPicture?.PictureUrl || null, jerseyImg: null, formationPlace: 99, rating: null,
    }))
    if (side === 'home') { result.home = players; result.homeFormation = td.Tactics || ''; result.homeCoach = hc?.Name?.[0]?.Description || '' }
    else                 { result.away = players; result.awayFormation = td.Tactics || ''; result.awayCoach = hc?.Name?.[0]?.Description || '' }
  }
  return result
}

function parseEspnTimeline(summary) {
  // Extract home/away team IDs from the summary header for side assignment
  const comp = summary?.header?.competitions?.[0]
  const homeId = String(comp?.competitors?.find(c=>c.homeAway==='home')?.team?.id || '')
  const awayId = String(comp?.competitors?.find(c=>c.homeAway==='away')?.team?.id || '')

  const seen = new Set()
  const items = [...(summary?.plays || []), ...(summary?.keyEvents || []), ...(summary?.scoringPlays || [])]
    .filter(p => { const k = p.id ?? JSON.stringify(p); return seen.has(k) ? false : (seen.add(k), true) })
  const out = []
  for (const p of items) {
    const tt = String(p.type?.text || p.type?.name || '').toLowerCase()
    const ti = String(p.type?.id || '')
    const isGoal = tt.includes('goal') || ti === '70' || ti === '72' || tt === 'score'
    const isCard = tt.includes('yellow') || tt.includes('red') || ['93','94','95'].includes(ti)
    if (!isGoal && !isCard) continue
    const dv = p.clock?.displayValue, sv = p.clock?.value
    const min = dv ? String(parseInt(dv) || dv.split(':')[0] || '') : typeof sv === 'number' ? String(Math.floor(sv/60)) : ''
    const scorer = p.participants?.find(x => (x.type?.id === 'scorer' || x.type?.id === '1' || (x.type?.text||'').toLowerCase().includes('scorer')))
    const player = scorer?.athlete?.displayName || p.participants?.[0]?.athlete?.displayName || ''
    const teamId = String(p.team?.id || '')
    const side = homeId && teamId === homeId ? 'home'
               : awayId && teamId === awayId ? 'away' : ''
    out.push({ min, type: isGoal ? 'goal' : tt.includes('red') ? 'red' : 'yellow', player, side })
  }
  return out.sort((a,b) => (parseInt(a.min)||0) - (parseInt(b.min)||0))
}

// ── Predictions ───────────────────────────────────────────────
function predictMatch(homeRank, awayRank) {
  if (!homeRank || !awayRank) return { home: 38, draw: 24, away: 38 }
  // Simple logistic model on FIFA ranking difference
  const diff = awayRank - homeRank  // positive = home is stronger
  const pWin = 1 / (1 + Math.pow(10, -diff / 50))
  const pDraw = 0.25
  const pHome = Math.round(pWin * (1 - pDraw) * 100)
  const pAway = Math.round((1 - pWin) * (1 - pDraw) * 100)
  const pD    = 100 - pHome - pAway
  return { home: Math.max(5, pHome), draw: Math.max(5, pD), away: Math.max(5, pAway) }
}

// ── Utilities ─────────────────────────────────────────────────
function EventIcon({ type }) {
  const t = (type || '').toLowerCase()
  if (t === 'goal') return <span className="mx-evt-icon">⚽</span>
  if (t === 'yellow') return <span className="mx-evt-card yellow" />
  if (t === 'red')    return <span className="mx-evt-card red" />
  return <span>•</span>
}

function fmtLocalTime(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (isNaN(d)) return null
    return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', timeZone:'America/Los_Angeles' })
  } catch { return null }
}

function normName(n = '') {
  return n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z]/g,'')
}

function annotatePlayerEvents(players, events) {
  return players.map(p => {
    const pw = (p.name||'').split(/\s+/).map(normName).filter(w => w.length > 2)
    const mine = events.filter(e => {
      const ew = (e.player||'').split(/\s+/).map(normName).filter(w => w.length > 2)
      return ew.some(w => pw.includes(w))
    })
    return { ...p, goals: mine.filter(e=>e.type==='goal').length, yellows: mine.filter(e=>e.type==='yellow').length, reds: mine.filter(e=>e.type==='red').length }
  })
}

// ── Prediction bar ────────────────────────────────────────────
function PredictionBar({ home, draw, away, homeAbbr, awayAbbr }) {
  return (
    <div className="mx-pred">
      <div className="mx-pred-bar">
        <div className="mx-pred-seg home" style={{ width:`${home}%` }} />
        <div className="mx-pred-seg draw" style={{ width:`${draw}%` }} />
        <div className="mx-pred-seg away" style={{ width:`${away}%` }} />
      </div>
      <div className="mx-pred-labels">
        <span className="mx-pred-pct home">{home}%</span>
        <span className="mx-pred-pct draw">{draw}%</span>
        <span className="mx-pred-pct away">{away}%</span>
      </div>
    </div>
  )
}

// ── Pitch layout ──────────────────────────────────────────────
const POS_ROW = {G:3,GK:3,CD:2,CB:2,LB:2,RB:2,LWB:2,RWB:2,SW:2,D:2,WB:2,CM:1,DM:1,CDM:1,CAM:1,AM:1,LM:1,RM:1,M:1,LW:1,RW:1,WM:1,ST:0,CF:0,SS:0,FW:0,F:0,ATT:0,LF:0,RF:0}
function posRow(pos='') { return POS_ROW[pos.toUpperCase().split('-')[0]] ?? 1 }
const COL_X_HOME = [80,55,32,10]
const COL_X_AWAY = [20,45,68,90]

function PitchPlayer({ player, x, y }) {
  const [ps, setPs] = useState('headshot')
  const jerseyName = player.name ? player.name.split(/\s+/).slice(-1)[0] : player.jersey
  const src = ps === 'headshot' ? player.photo : ps === 'jersey' ? player.jerseyImg : null
  const hasEvts = (player.goals>0)||(player.yellows>0)||(player.reds>0)
  const rc = player.rating ? (+player.rating>=7.5?'r-great':+player.rating>=6.5?'r-ok':'r-bad') : null
  return (
    <div className="mx-pp" style={{left:`${x}%`,top:`${y}%`}}>
      <div className="mx-pp-photo">
        {src ? <img src={src} alt="" onError={()=>setPs(s=>s==='headshot'?'jersey':'none')} className="mx-pp-img" />
             : <span className="mx-pp-num-badge">{player.jersey}</span>}
        {hasEvts && (
          <div className="mx-pp-events">
            {Array.from({length:player.goals}).map((_,i)=><span key={`g${i}`} className="mx-pp-evt-ball">⚽</span>)}
            {player.yellows>0 && <span className="mx-pp-evt-card yellow" />}
            {player.reds>0    && <span className="mx-pp-evt-card red" />}
          </div>
        )}
      </div>
      <div className="mx-pp-label">
        <span className="mx-pp-num">#{player.jersey}</span>
        <span className="mx-pp-name">{jerseyName}</span>
        {player.rating && <span className={`mx-pp-rating ${rc}`}>{player.rating}</span>}
      </div>
    </div>
  )
}

function HalfPitch({ players, side='home' }) {
  const colX = side==='home' ? COL_X_HOME : COL_X_AWAY
  const cols = [[],[],[],[]]
  for (const p of players) cols[Math.min(posRow(p.pos),3)].push(p)
  return (
    <div className={`mx-half-pitch ${side}`}>
      {cols.map((col,ci)=>col.map((p,i)=>{
        const n=col.length, x=colX[ci], y=n<=1?50:15+(i/(n-1))*70
        return <PitchPlayer key={p.id||`${ci}-${i}`} player={p} x={x} y={y} />
      }))}
    </div>
  )
}

// ── Live match tile ───────────────────────────────────────────
function LiveMatchTile({ event, timeline, lineup }) {
  const { homeAbbr, awayAbbr, homeScore, awayScore, clock, isHT } = event
  const homeEvts = timeline.filter(e=>e.side==='home')
  const awayEvts = timeline.filter(e=>e.side==='away')
  const homePlayers = annotatePlayerEvents(lineup?.home||[], homeEvts)
  const awayPlayers = annotatePlayerEvents(lineup?.away||[], awayEvts)
  return (
    <div className="mx-live-tile">
      <div className="mx-live-hdr">
        <span className="mx-live-badge"><span className="mx-live-dot" />LIVE</span>
        <div className="mx-live-scorebar">
          <img src={flagUrl(homeAbbr)} alt={homeAbbr} className="mx-sb-flag" onError={e=>{e.target.style.display='none'}} />
          <span className="mx-sb-abbr">{homeAbbr}</span>
          <span className={`mx-sb-score${homeScore>awayScore?' lead':''}`}>{homeScore}</span>
          <span className="mx-sb-sep">{isHT?'HT':clock}</span>
          <span className={`mx-sb-score${awayScore>homeScore?' lead':''}`}>{awayScore}</span>
          <span className="mx-sb-abbr">{awayAbbr}</span>
          <img src={flagUrl(awayAbbr)} alt={awayAbbr} className="mx-sb-flag" onError={e=>{e.target.style.display='none'}} />
        </div>
      </div>
      <div className="mx-live-squads">
        <div className="mx-live-side">
          <div className="mx-live-side-hdr">
            <img src={flagUrl(homeAbbr)} alt="" className="mx-side-flag" onError={e=>{e.target.style.display='none'}} />
            <span className="mx-side-abbr">{homeAbbr}</span>
            {lineup?.homeFormation && <span className="mx-side-fmtn">{lineup.homeFormation}</span>}
          </div>
          {homePlayers.length>0
            ? <HalfPitch players={homePlayers} />
            : <div className="mx-no-lineup">
                {homeEvts.length>0
                  ? homeEvts.map((e,i)=><div key={i} className="mx-no-lineup-evt"><EventIcon type={e.type}/><span className="mx-nle-player">{e.player}</span>{e.min&&<span className="mx-nle-min">{e.min}'</span>}</div>)
                  : <span className="mx-no-lineup-msg">⏱ Lineup pending</span>}
              </div>}
          {lineup?.homeCoach && <div className="mx-side-coach">⚽ {lineup.homeCoach}</div>}
        </div>
        <div className="mx-live-divider" />
        <div className="mx-live-side">
          <div className="mx-live-side-hdr right">
            {lineup?.awayFormation && <span className="mx-side-fmtn">{lineup.awayFormation}</span>}
            <span className="mx-side-abbr">{awayAbbr}</span>
            <img src={flagUrl(awayAbbr)} alt="" className="mx-side-flag" onError={e=>{e.target.style.display='none'}} />
          </div>
          {awayPlayers.length>0
            ? <HalfPitch players={awayPlayers} side="away" />
            : <div className="mx-no-lineup">
                {awayEvts.length>0
                  ? awayEvts.map((e,i)=><div key={i} className="mx-no-lineup-evt">{e.min&&<span className="mx-nle-min">{e.min}'</span>}<span className="mx-nle-player">{e.player}</span><EventIcon type={e.type}/></div>)
                  : <span className="mx-no-lineup-msg">⏱ Lineup pending</span>}
              </div>}
          {lineup?.awayCoach && <div className="mx-side-coach">⚽ {lineup.awayCoach}</div>}
        </div>
      </div>
    </div>
  )
}

// ── Match row ─────────────────────────────────────────────────
// dayOffset: -1=prev, 0=current, 1=future
function MatchRow({ m, showDetails, dayOffset, fifaInfo, statusMap, timelines, rankings }) {
  const ft  = m.score?.ft
  const state = fifaInfo?.state
  const displayScore = ft || (state==='post' ? fifaInfo?.postScore : null)
  const [ds1,ds2] = displayScore || []
  const played = !!displayScore
  const isLive = !played && state==='in'

  const win1 = played && ds1>ds2, win2 = played && ds2>ds1
  const url1 = flagUrl(m.team1), url2 = flagUrl(m.team2)
  const localTime = fifaInfo?.date ? fmtLocalTime(fifaInfo.date) : null
  const venue = fifaInfo?.venue || null
  const mk = fifaInfo?.mk
  const timeline = showDetails && (played||isLive) ? (timelines?.[mk]||[]) : []
  const homeEvts = timeline.filter(e=>e.side==='home')
  const awayEvts = timeline.filter(e=>e.side==='away')
  // Events without side info (ESPN fallback) — split half/half
  const noSideEvts = timeline.filter(e=>!e.side)
  const homeDisplay = homeEvts.length>0 ? homeEvts : noSideEvts.slice(0, Math.ceil(noSideEvts.length/2))
  const awayDisplay = awayEvts.length>0 ? awayEvts : noSideEvts.slice(Math.ceil(noSideEvts.length/2))

  // Prediction (future card, upcoming)
  const pred = (!played && !isLive && dayOffset===1 && rankings)
    ? predictMatch(rankings[ab(m.team1)], rankings[ab(m.team2)])
    : null

  return (
    <div className={`mx-row${played?' played':''}${isLive?' live':''}`}>
      {/* Home team cell */}
      <div className="mx-team-cell left">
        {url1 && <img src={url1} alt={ab(m.team1)} className="mx-flag" onError={e=>{e.target.style.display='none'}} />}
        <span className={`mx-name${win1?' win':''} st-${statusMap?.[m.team1]||'tbd'}`}>{ab(m.team1)}</span>
        {homeDisplay.length>0 && (
          <div className="mx-row-events home">
            {homeDisplay.map((e,i)=>(
              <span key={i} className="mx-row-evt">
                {e.player&&<>{e.player} </>}<EventIcon type={e.type}/>{e.min&&<> {e.min}'</>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Center column — wider when showing prediction bar */}
      <div className={`mx-center${pred?' has-pred':''}`}>
        {/* Live: slider + pip */}
        {isLive && <div className="mx-live-slider" />}
        {isLive && <span className="mx-live-pip" />}
        {isLive && fifaInfo?.clock && <span className="mx-live-match-clock">{fifaInfo.clock}</span>}

        {/* FT label — current day completed only */}
        {played && dayOffset===0 && <span className="mx-ft-badge above">FT</span>}

        {/* Prediction bar ABOVE VS — future card upcoming only */}
        {pred && <PredictionBar {...pred} />}

        {/* Score / VS */}
        {played
          ? <span className="mx-score">{ds1}–{ds2}</span>
          : isLive && fifaInfo?.liveScore
            ? <span className="mx-score mx-score-live">{fifaInfo.liveScore[0]}–{fifaInfo.liveScore[1]}</span>
            : <span className="mx-vs">vs</span>}

        {/* Time + venue — all cards, all match states */}
        {!isLive && (localTime||venue) && (
          <div className="mx-match-detail">
            {localTime && <span className="mx-match-time">{localTime}</span>}
            {venue && <span className="mx-match-venue">{venue}</span>}
          </div>
        )}
      </div>

      {/* Away team cell */}
      <div className="mx-team-cell right">
        {awayDisplay.length>0 && (
          <div className="mx-row-events away">
            {awayDisplay.map((e,i)=>(
              <span key={i} className="mx-row-evt">
                {e.min&&<>{e.min}' </>}<EventIcon type={e.type}/>{e.player&&<> {e.player}</>}
              </span>
            ))}
          </div>
        )}
        <span className={`mx-name${win2?' win':''} st-${statusMap?.[m.team2]||'tbd'}`}>{ab(m.team2)}</span>
        {url2 && <img src={url2} alt={ab(m.team2)} className="mx-flag" onError={e=>{e.target.style.display='none'}} />}
      </div>
    </div>
  )
}

function ordinal(n) {
  if ([11,12,13].includes(n%100)) return `${n}th`
  if (n%10===1) return `${n}st`; if (n%10===2) return `${n}nd`; if (n%10===3) return `${n}rd`
  return `${n}th`
}

// ── Matchday block ────────────────────────────────────────────
function RoundBlock({ roundName, ms, highlight, dayOffset, showDetails, fifaMap, statusMap, timelines, rankings }) {
  const played = ms.filter(m=>m.score?.ft).length
  let roundDateStr = null
  for (const m of ms) {
    const fi = fifaMap?.[abKey(m.team1,m.team2)]
    if (fi?.date) {
      try {
        const d = new Date(fi.date)
        const month = new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'America/Los_Angeles'}).format(d)
        const day   = parseInt(new Intl.DateTimeFormat('en-US',{day:'numeric',timeZone:'America/Los_Angeles'}).format(d))
        roundDateStr = `${month} ${ordinal(day)}`
      } catch {}
      break
    }
  }
  return (
    <div className={`mx-block${highlight?' current':''}`}>
      <div className="mx-block-hdr">
        <span className="mx-rnd-name">{roundName}</span>
      </div>
      {roundDateStr && <div className="mx-rnd-date">{roundDateStr}</div>}
      <div className="mx-block-matches">
        {ms.map((m,i)=>(
          <MatchRow
            key={i} m={m}
            showDetails={showDetails}
            dayOffset={dayOffset}
            fifaInfo={fifaMap?.[abKey(m.team1,m.team2)]}
            statusMap={statusMap}
            timelines={timelines}
            rankings={rankings}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────
function roundNum(r) { const m=r?.match(/\d+/); return m ? +m[0] : 999 }

export default function Matches({ matches, groups, onLiveChange }) {
  const [fifaMap,      setFifaMap]      = useState({})
  const [liveMatches,  setLiveMatches]  = useState([])
  const [timelines,    setTimelines]    = useState({})
  const [lineups,      setLineups]      = useState({})
  const [rankings,     setRankings]     = useState(null)  // abbr → FIFA rank position
  const [currentLiveIdx, setCurrentLiveIdx] = useState(0)
  const fetchedKeys = useRef(new Set())

  // Cycle live games every 20s
  useEffect(() => {
    if (liveMatches.length<=1) return
    const t = setInterval(()=>setCurrentLiveIdx(i=>(i+1)%liveMatches.length), 20_000)
    return () => clearInterval(t)
  }, [liveMatches.length])
  useEffect(() => { setCurrentLiveIdx(0) }, [liveMatches.length])

  // Fetch FIFA rankings (rarely changes — hourly is fine)
  useEffect(() => {
    const loadRankings = async () => {
      try {
        const d = await fetch(FIFA_RANKINGS).then(r=>r.json())
        const map = {}
        for (const r of d.Rankings || []) {
          const abbr = r.Team?.Abbreviation?.toUpperCase()
          if (abbr) map[abbr] = r.RankingPosition
        }
        setRankings(map)
      } catch {}
    }
    loadRankings()
    const iv = setInterval(loadRankings, 60 * 60_000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const ptDate = (offset=0) => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'})
      .format(new Date(Date.now()+offset*86400000)).replace(/-/g,'')

    const load = async () => {
      const newMap = {}        // key → match metadata
      const espnIds = {}       // key → ESPN event id (for summary fallback)
      const newTimelines = {}
      const newLineups   = {}

      // ── FIFA + ESPN in parallel ──────────────────────────────
      const [fifaResult, espnResult] = await Promise.allSettled([
        fetch(FIFA_CALENDAR).then(r=>r.json()),
        Promise.all([
          fetch(`${ESPN_BOARD}?dates=${ptDate(-1)}`).then(r=>r.json()),
          fetch(`${ESPN_BOARD}?dates=${ptDate(0)}`).then(r=>r.json()),
          fetch(`${ESPN_BOARD}?dates=${ptDate(1)}`).then(r=>r.json()),
        ]),
      ])

      // Build base from ESPN (secondary)
      if (espnResult.status==='fulfilled') {
        const espnEvts = espnResult.value.flatMap(d=>d.events||[])
        for (const ev of espnEvts) {
          const comp = ev.competitions?.[0]
          const h = comp?.competitors?.find(c=>c.homeAway==='home')
          const a = comp?.competitors?.find(c=>c.homeAway==='away')
          const hA = h?.team?.abbreviation?.toUpperCase()
          const aA = a?.team?.abbreviation?.toUpperCase()
          if (!hA||!aA) continue
          const key   = rawAbKey(hA,aA)
          const state = ev.status?.type?.state   // 'pre'|'in'|'post'
          const sc    = [parseInt(h.score??'0'), parseInt(a.score??'0')]
          espnIds[key] = ev.id
          newMap[key]  = {
            mk: `espn:${ev.id}`, date: ev.date,
            venue: appendState([comp.venue?.fullName||comp.venue?.shortName, comp.venue?.address?.city||comp.venue?.city].filter(Boolean).join(', ')),
            state, clock: ev.status?.displayClock||'',
            liveScore:  state==='in'   ? sc : null,
            postScore:  state==='post' ? sc : null,
          }
        }
      }

      // Override/augment with FIFA (primary)
      let calResults = []
      if (fifaResult.status==='fulfilled') {
        calResults = fifaResult.value.Results || []
        for (const m of calResults) {
          const hA = (m.HomeTeam?.Abbreviation||'').toUpperCase()
          const aA = (m.AwayTeam?.Abbreviation||'').toUpperCase()
          if (!hA||!aA) continue
          const key   = rawAbKey(hA,aA)
          const s     = m.MatchStatus   // 0=upcoming, 3=live, >=4=finished
          const state = s===3 ? 'in' : s>=4 ? 'post' : 'pre'
          const sc    = [m.HomeTeam.Score??0, m.AwayTeam.Score??0]
          const existing = newMap[key]||{}
          newMap[key] = {
            mk:        `${m.IdStage}/${m.IdMatch}`,
            idStage:   m.IdStage,
            idMatch:   m.IdMatch,
            date:      m.Date || existing.date,
            venue:     (() => {
              const stadium = m.Stadium?.Name?.[0]?.Description || ''
              const city = m.Stadium?.CityName?.[0]?.Description
                        || m.Stadium?.City?.[0]?.Description
                        || m.Stadium?.City?.Name?.[0]?.Description
                        || m.Stadium?.CityName || ''
              return appendState([stadium, city].filter(Boolean).join(', ')) || existing.venue || ''
            })(),
            state,
            clock:     m.MatchTime || existing.clock || '',
            liveScore: state==='in'   ? sc : null,
            postScore: state==='post' ? sc : null,
            _espnId:   existing._espnId || espnIds[key] || null,
          }
        }
      }
      setFifaMap(newMap)

      // ── Live matches ─────────────────────────────────────────
      const liveInMap = Object.entries(newMap).filter(([,v])=>v.state==='in')
      // Prefer FIFA calendar's live entries to get idStage/idMatch
      const liveObjs = []
      for (const [key, entry] of liveInMap) {
        const [a1, a2] = key.split('|')
        liveObjs.push({
          mk: entry.mk, idStage: entry.idStage, idMatch: entry.idMatch,
          homeAbbr: a1, awayAbbr: a2,
          homeScore: entry.liveScore?.[0]??0,
          awayScore: entry.liveScore?.[1]??0,
          clock: entry.clock||'?',
          isHT:  entry.clock==='HT',
        })
      }
      setLiveMatches(liveObjs)

      // Fetch live match details from FIFA live endpoint
      await Promise.all(liveObjs.map(async lm => {
        if (!lm.idStage||!lm.idMatch) return
        try {
          const fd = await fetch(FIFA_LIVE(lm.idStage,lm.idMatch)).then(r=>r.json())
          newTimelines[lm.mk] = parseFifaEventsFromTeams(fd)
          newLineups[lm.mk]   = parseFifaLineup(fd)
        } catch { newTimelines[lm.mk] = [] }
      }))

      // Also fetch ESPN summary for live games (merge events for side info)
      await Promise.all(liveObjs.map(async lm => {
        const [a1,a2] = lm.mk ? [] : []
        const espnId = espnIds[rawAbKey(lm.homeAbbr,lm.awayAbbr)]
        if (!espnId) return
        try {
          const d2 = await fetch(ESPN_SUM(espnId)).then(r=>r.json())
          const espnEvts = parseEspnTimeline(d2)
          const existing = newTimelines[lm.mk]||[]
          if (espnEvts.length>existing.length) newTimelines[lm.mk] = espnEvts
        } catch {}
      }))

      // ── Completed match events ───────────────────────────────
      const completed = Object.entries(newMap).filter(([k,v])=>
        v.state==='post' && !fetchedKeys.current.has(v.mk)
      )

      await Promise.all(completed.map(async ([key,entry]) => {
        const mk = entry.mk

        // Attempt 1: FIFA timeline endpoint (primary)
        if (entry.idStage && entry.idMatch) {
          try {
            const fd = await fetch(FIFA_TIMELINE(entry.idStage,entry.idMatch)).then(r=>r.json())
            const evts = parseFifaTimeline(fd)
            if (evts.length>0) { newTimelines[mk]=evts; fetchedKeys.current.add(mk); return }
          } catch {}

          // Attempt 2: FIFA live endpoint (keeps data briefly after FT)
          try {
            const fd = await fetch(FIFA_LIVE(entry.idStage,entry.idMatch)).then(r=>r.json())
            const evts = parseFifaEventsFromTeams(fd)
            if (evts.length>0) { newTimelines[mk]=evts; fetchedKeys.current.add(mk); return }
          } catch {}
        }

        // Attempt 3: ESPN summary (backup)
        const espnId = entry._espnId || espnIds[key]
        if (espnId) {
          try {
            const d2 = await fetch(ESPN_SUM(espnId)).then(r=>r.json())
            newTimelines[mk] = parseEspnTimeline(d2)
            fetchedKeys.current.add(mk)
            return
          } catch {}
        }

        // Mark attempted so we don't hammer on 404s
        fetchedKeys.current.add(mk)
      }))

      setTimelines(prev=>({ ...prev, ...newTimelines }))
      if (Object.keys(newLineups).length) setLineups(prev=>({ ...prev, ...newLineups }))
    }

    load()
    const iv = setInterval(load, 10_000)
    return () => clearInterval(iv)
  }, [])

  // Augment static matches with live API completions
  const augMatches = useMemo(()=>matches.map(m=>{
    if (m.score?.ft) return m
    const fi = fifaMap[abKey(m.team1,m.team2)]
    if (fi?.state==='post' && fi?.postScore) return { ...m, score: { ...m.score, ft: fi.postScore } }
    return m
  }), [matches, fifaMap])

  const { rounds, activeIdx } = useMemo(()=>{
    const byRound = {}
    for (const m of augMatches.filter(m=>m.group)) {
      if (!byRound[m.round]) byRound[m.round]=[]
      byRound[m.round].push(m)
    }
    const rounds = Object.entries(byRound).sort((a,b)=>roundNum(a[0])-roundNum(b[0]))
    const todayPT = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date())
    const ptDay = iso => { try { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date(iso)) } catch { return '' } }

    const todayIdx = rounds.findIndex(([,ms])=>ms.some(m=>{
      const fi = fifaMap[abKey(m.team1,m.team2)]
      return fi?.date && ptDay(fi.date)===todayPT
    }))
    if (todayIdx>=0) return { rounds, activeIdx: todayIdx }

    let activeIdx = rounds.findIndex(([,ms])=>ms.some(m=>!m.score?.ft))
    if (activeIdx<0) activeIdx=rounds.length-1
    return { rounds, activeIdx }
  }, [augMatches, fifaMap])

  const visible = useMemo(()=>{
    const out=[]
    for (const i of [activeIdx-1, activeIdx, activeIdx+1]) {
      if (i>=0&&i<rounds.length) out.push({ round:rounds[i], idx:i })
    }
    return out
  }, [rounds, activeIdx])

  const statusMap = useMemo(()=>buildTeamStatusMap(computeGroups(augMatches)), [augMatches])
  const hasLive   = liveMatches.length>0
  const liveCount = liveMatches.length
  useEffect(()=>{ onLiveChange?.(hasLive) }, [hasLive, onLiveChange])
  const safeIdx    = Math.min(currentLiveIdx, Math.max(liveCount-1,0))
  const currentLive = liveMatches[safeIdx]

  return (
    <div className="mx-outer">
      <div className={`mx-schedule-row${hasLive?'':' no-live'}`}>
        {visible.map(({ round:[name,ms], idx })=>(
          <RoundBlock
            key={name}
            roundName={name}
            ms={ms}
            highlight={idx===activeIdx}
            dayOffset={idx-activeIdx}
            showDetails={idx===activeIdx || idx===activeIdx-1}
            fifaMap={fifaMap}
            statusMap={idx<=activeIdx ? statusMap : undefined}
            timelines={timelines}
            rankings={rankings}
          />
        ))}
      </div>

      {hasLive && (
        <div className="mx-live-section">
          <div className="mx-live-section-label">
            <span className="mx-live-dot" />
            LIVE NOW — {liveCount} match{liveCount>1?'es':''}
            {liveCount>1 && (
              <span className="mx-live-game-dots">
                {liveMatches.map((_,i)=>(
                  <button key={i} className={`mx-live-game-dot${i===safeIdx?' on':''}`}
                    onClick={()=>setCurrentLiveIdx(i)} />
                ))}
              </span>
            )}
          </div>
          {currentLive && (
            <LiveMatchTile
              key={currentLive.mk}
              event={currentLive}
              timeline={timelines[currentLive.mk]||[]}
              lineup={lineups[currentLive.mk]}
            />
          )}
        </div>
      )}
    </div>
  )
}
