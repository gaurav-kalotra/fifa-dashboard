import { useMemo, useState, useEffect, useRef } from 'react'
import { ab, flagUrl, buildTeamStatusMap, computeGroups } from '../utils'

// ── FIFA (primary) ────────────────────────────────────────────
const FIFA_BASE     = 'https://api.fifa.com/api/v3'
const FIFA_COMP     = 17
const FIFA_SEASON   = '285023'
const FIFA_CALENDAR = `${FIFA_BASE}/calendar/matches?idCompetition=${FIFA_COMP}&idSeason=${FIFA_SEASON}&language=en&count=500`
const FIFA_LIVE     = (stageId, matchId) =>
  `${FIFA_BASE}/live/football/${FIFA_COMP}/${FIFA_SEASON}/${stageId}/${matchId}?language=en`
const FIFA_TIMELINE = (stageId, matchId) =>
  `${FIFA_BASE}/timelines/${FIFA_COMP}/${FIFA_SEASON}/${stageId}/${matchId}?language=en`
const FIFA_POS_ABBR = { 0:'GK', 1:'D', 2:'M', 3:'F' }

// ── ESPN (fallback) ───────────────────────────────────────────
const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'
const ESPN_SUMMARY    = id => `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${id}`

// ── Key helpers ───────────────────────────────────────────────
function abKey(t1, t2) {
  return [ab(t1) || t1.slice(0,3).toUpperCase(), ab(t2) || t2.slice(0,3).toUpperCase()].sort().join('|')
}
function rawAbKey(a, b) {
  return [a.toUpperCase(), b.toUpperCase()].sort().join('|')
}

// ── FIFA parsers ──────────────────────────────────────────────
const FIFA_EVT_TYPES = {
  goal:    new Set([0, 15]),   // goal, penalty goal
  ownGoal: new Set([12]),
  yellow:  new Set([3, 65]),
  red:     new Set([4, 5]),    // second yellow, direct red
}

function parseFifaEventsFromTeams(fd) {
  const out = []
  for (const [side, team] of [['home', fd?.HomeTeam], ['away', fd?.AwayTeam]]) {
    for (const ev of team?.Events || []) {
      const t = ev.Type
      const isGoal   = FIFA_EVT_TYPES.goal.has(t) || FIFA_EVT_TYPES.ownGoal.has(t)
      const isYellow = FIFA_EVT_TYPES.yellow.has(t)
      const isRed    = FIFA_EVT_TYPES.red.has(t)
      if (!isGoal && !isYellow && !isRed) continue
      out.push({
        min: String(ev.MatchMinute ?? ''),
        type: FIFA_EVT_TYPES.ownGoal.has(t) ? 'goal' : isGoal ? 'goal' : isYellow ? 'yellow' : 'red',
        player: ev.PlayerName?.[0]?.Description || '',
        side,
      })
    }
  }
  return out.sort((a, b) => (parseInt(a.min)||0) - (parseInt(b.min)||0))
}

function parseFifaTimeline(data) {
  // Timeline endpoint returns events at top level
  const evts = data?.Event || data?.Events || []
  const out = []
  for (const ev of evts) {
    const t = ev.Type
    const isGoal   = FIFA_EVT_TYPES.goal.has(t) || FIFA_EVT_TYPES.ownGoal.has(t)
    const isYellow = FIFA_EVT_TYPES.yellow.has(t)
    const isRed    = FIFA_EVT_TYPES.red.has(t)
    if (!isGoal && !isYellow && !isRed) continue
    const hoa  = ev.HomeOrAway ?? ev.Team
    const side = (hoa === 1 || hoa === 'Home') ? 'home'
               : (hoa === 2 || hoa === 'Away') ? 'away' : ''
    out.push({
      min: String(ev.MatchMinute ?? ''),
      type: FIFA_EVT_TYPES.ownGoal.has(t) ? 'goal' : isGoal ? 'goal' : isYellow ? 'yellow' : 'red',
      player: ev.PlayerName?.[0]?.Description || ev.Player?.Name?.[0]?.Description || '',
      side,
    })
  }
  return out.sort((a, b) => (parseInt(a.min)||0) - (parseInt(b.min)||0))
}

function parseFifaLineup(data) {
  const result = { home:[], away:[], homeCoach:'', awayCoach:'', homeFormation:'', awayFormation:'' }
  for (const [side, td] of [['home', data?.HomeTeam], ['away', data?.AwayTeam]]) {
    if (!td) continue
    const hc = (td.Coaches || []).find(c => c.Role === 1) || td.Coaches?.[0]
    const coach = hc?.Name?.[0]?.Description || ''
    const allP = td.Players || []
    const starters = allP.filter(p => p.Status === 1)
    const used = starters.length > 0 ? starters : allP.filter(p => p.Status <= 2).slice(0, 11)
    const players = used.map(p => ({
      id: p.IdPlayer,
      name: p.ShortName?.[0]?.Description || p.PlayerName?.[0]?.Description || '',
      jersey: String(p.ShirtNumber ?? ''),
      pos: FIFA_POS_ABBR[p.Position] || 'M',
      photo: p.PlayerPicture?.PictureUrl || null,
      jerseyImg: null,
      formationPlace: 99,
      rating: null,
    }))
    if (side === 'home') { result.home = players; result.homeFormation = td.Tactics || ''; result.homeCoach = coach }
    else                 { result.away = players; result.awayFormation = td.Tactics || ''; result.awayCoach = coach }
  }
  return result
}

// ── ESPN timeline parser (fallback) ──────────────────────────
function parseEspnTimeline(summary) {
  const seen = new Set()
  const items = [
    ...(summary?.plays || []),
    ...(summary?.keyEvents || []),
    ...(summary?.scoringPlays || []),
  ].filter(p => { const k = p.id ?? JSON.stringify(p); return seen.has(k) ? false : (seen.add(k), true) })
  const out = []
  for (const p of items) {
    const typeText = String(p.type?.text || p.type?.name || '').toLowerCase()
    const typeId   = String(p.type?.id || '')
    const isGoal = typeText.includes('goal') || typeId === '70' || typeId === '72' || typeText === 'score'
    const isCard = typeText.includes('yellow') || typeText.includes('red') || ['93','94','95'].includes(typeId)
    if (!isGoal && !isCard) continue
    const dispVal = p.clock?.displayValue
    const secVal  = p.clock?.value
    let min = ''
    if (dispVal) min = String(parseInt(dispVal) || dispVal.split(':')[0] || '')
    else if (typeof secVal === 'number') min = String(Math.floor(secVal / 60))
    const scorer = p.participants?.find(x =>
      (x.type?.id === 'scorer' || x.type?.id === '1' ||
       (x.type?.text || '').toLowerCase().includes('scorer'))
    )
    const player = scorer?.athlete?.displayName || p.participants?.[0]?.athlete?.displayName || ''
    out.push({
      min,
      type: isGoal ? 'goal' : typeText.includes('red') ? 'red' : 'yellow',
      player,
      side: '',
    })
  }
  return out.sort((a, b) => (parseInt(a.min)||0) - (parseInt(b.min)||0))
}

// ── UI helpers ────────────────────────────────────────────────
function EventIcon({ type }) {
  const t = (type || '').toLowerCase()
  if (t.includes('owngoal') || t.includes('own')) return <><span className="mx-evt-icon">⚽</span><sup className="mx-og-sup">og</sup></>
  if (t.includes('goal') || t === 'goal' || t === 'pen') return <span className="mx-evt-icon">⚽</span>
  if (t.includes('yellow') && t.includes('red')) return <span className="mx-evt-card" style={{background:'linear-gradient(135deg,#fbbf24 50%,#ef4444 50%)'}} />
  if (t.includes('yellow')) return <span className="mx-evt-card yellow" />
  if (t.includes('red'))    return <span className="mx-evt-card red" />
  return <span>•</span>
}

function fmtLocalTime(isoDate) {
  if (!isoDate) return null
  try {
    const d = new Date(isoDate)
    if (isNaN(d)) return null
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'America/Los_Angeles' })
  } catch { return null }
}

function normName(n = '') {
  return n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
}

function annotatePlayerEvents(players, events) {
  return players.map(p => {
    const pWords = (p.name || '').split(/\s+/).map(normName).filter(w => w.length > 2)
    const mine = events.filter(e => {
      const eWords = (e.player || '').split(/\s+/).map(normName).filter(w => w.length > 2)
      return eWords.some(ew => pWords.includes(ew))
    })
    return { ...p,
      goals:   mine.filter(e => e.type === 'goal').length,
      yellows: mine.filter(e => e.type === 'yellow').length,
      reds:    mine.filter(e => e.type === 'red').length,
    }
  })
}

// ── Pitch layout ──────────────────────────────────────────────
const POS_ROW_BASE = {
  G:3, GK:3,
  CD:2, CB:2, LB:2, RB:2, LWB:2, RWB:2, SW:2, D:2, WB:2,
  CM:1, DM:1, CDM:1, CAM:1, AM:1, LM:1, RM:1, M:1, LW:1, RW:1, WM:1,
  ST:0, CF:0, SS:0, FW:0, F:0, ATT:0, LF:0, RF:0,
}
function posRow(pos = '') { return POS_ROW_BASE[pos.toUpperCase().split('-')[0]] ?? 1 }

const COL_X_HOME = [80, 55, 32, 10]
const COL_X_AWAY = [20, 45, 68, 90]

function PitchPlayer({ player, x, y }) {
  const [photoState, setPhotoState] = useState('headshot')
  const jerseyName = player.name ? player.name.split(/\s+/).slice(-1)[0] : player.jersey
  const src = photoState === 'headshot' ? player.photo : photoState === 'jersey' ? player.jerseyImg : null
  const onErr = () => setPhotoState(s => s === 'headshot' ? 'jersey' : 'none')
  const ratingClass = player.rating
    ? +player.rating >= 7.5 ? 'r-great' : +player.rating >= 6.5 ? 'r-ok' : 'r-bad' : null
  const hasEvents = (player.goals > 0) || (player.yellows > 0) || (player.reds > 0)
  return (
    <div className="mx-pp" style={{ left:`${x}%`, top:`${y}%` }}>
      <div className="mx-pp-photo">
        {src ? <img src={src} alt="" onError={onErr} className="mx-pp-img" />
              : <span className="mx-pp-num-badge">{player.jersey}</span>}
        {hasEvents && (
          <div className="mx-pp-events">
            {player.goals > 0 && Array.from({ length: player.goals }).map((_, i) => (
              <span key={`g${i}`} className="mx-pp-evt-ball">⚽</span>
            ))}
            {player.yellows > 0 && <span className="mx-pp-evt-card yellow" />}
            {player.reds > 0 && <span className="mx-pp-evt-card red" />}
          </div>
        )}
      </div>
      <div className="mx-pp-label">
        <span className="mx-pp-num">#{player.jersey}</span>
        <span className="mx-pp-name">{jerseyName}</span>
        {player.rating && <span className={`mx-pp-rating ${ratingClass}`}>{player.rating}</span>}
      </div>
    </div>
  )
}

function HalfPitch({ players, side = 'home' }) {
  const colX = side === 'home' ? COL_X_HOME : COL_X_AWAY
  const cols = [[],[],[],[]]
  for (const p of players) cols[Math.min(posRow(p.pos), 3)].push(p)
  return (
    <div className={`mx-half-pitch ${side}`}>
      {cols.map((col, ci) =>
        col.map((p, i) => {
          const n = col.length
          const x = colX[ci]
          const y = n <= 1 ? 50 : 15 + (i / (n - 1)) * 70
          return <PitchPlayer key={p.id || `${ci}-${i}`} player={p} x={x} y={y} />
        })
      )}
    </div>
  )
}

// ── Live match tile ───────────────────────────────────────────
// `event` is a flat live-match object: {mk, homeAbbr, awayAbbr, homeScore, awayScore, clock, isHT}
function LiveMatchTile({ event, timeline, lineup }) {
  const { homeAbbr, awayAbbr, homeScore, awayScore, clock, isHT } = event
  const homeFlagUrl = flagUrl(homeAbbr) || flagUrl(homeAbbr)
  const awayFlagUrl = flagUrl(awayAbbr) || flagUrl(awayAbbr)

  const homeEvts = timeline.filter(e => e.side === 'home')
  const awayEvts = timeline.filter(e => e.side === 'away')
  const homePlayers = annotatePlayerEvents(lineup?.home || [], homeEvts)
  const awayPlayers = annotatePlayerEvents(lineup?.away || [], awayEvts)

  return (
    <div className="mx-live-tile">
      <div className="mx-live-hdr">
        <span className="mx-live-badge"><span className="mx-live-dot" />LIVE</span>
        <div className="mx-live-scorebar">
          <img src={flagUrl(homeAbbr)} alt={homeAbbr} className="mx-sb-flag" onError={e=>{e.target.style.display='none'}} />
          <span className="mx-sb-abbr">{homeAbbr}</span>
          <span className={`mx-sb-score${homeScore > awayScore ? ' lead' : ''}`}>{homeScore}</span>
          <span className="mx-sb-sep">{isHT ? 'HT' : clock}</span>
          <span className={`mx-sb-score${awayScore > homeScore ? ' lead' : ''}`}>{awayScore}</span>
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
          {homePlayers.length > 0
            ? <HalfPitch players={homePlayers} />
            : <div className="mx-no-lineup">
                {homeEvts.length > 0
                  ? homeEvts.map((e, i) => (
                      <div key={i} className="mx-no-lineup-evt">
                        <EventIcon type={e.type} />
                        <span className="mx-nle-player">{e.player}</span>
                        {e.min && <span className="mx-nle-min">{e.min}'</span>}
                      </div>
                    ))
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
          {awayPlayers.length > 0
            ? <HalfPitch players={awayPlayers} side="away" />
            : <div className="mx-no-lineup">
                {awayEvts.length > 0
                  ? awayEvts.map((e, i) => (
                      <div key={i} className="mx-no-lineup-evt">
                        {e.min && <span className="mx-nle-min">{e.min}'</span>}
                        <span className="mx-nle-player">{e.player}</span>
                        <EventIcon type={e.type} />
                      </div>
                    ))
                  : <span className="mx-no-lineup-msg">⏱ Lineup pending</span>}
              </div>}
          {lineup?.awayCoach && <div className="mx-side-coach">⚽ {lineup.awayCoach}</div>}
        </div>
      </div>
    </div>
  )
}

// ── Match row ─────────────────────────────────────────────────
function MatchRow({ m, showDetails, isCurrent, fifaInfo, statusMap, timelines }) {
  const ft = m.score?.ft
  const state = fifaInfo?.state
  const displayScore = ft || (state === 'post' ? fifaInfo?.postScore : null)
  const [ds1, ds2] = displayScore || []
  const played = !!displayScore
  const isLive = !played && state === 'in'

  const win1 = played && ds1 > ds2
  const win2 = played && ds2 > ds1
  const url1 = flagUrl(m.team1)
  const url2 = flagUrl(m.team2)
  const localTime = fifaInfo?.date ? fmtLocalTime(fifaInfo.date) : null
  const venue = fifaInfo?.venue || null
  const mk = fifaInfo?.mk
  const timeline = showDetails && (played || isLive) ? (timelines?.[mk] || []) : []
  const homeEvents = timeline.filter(e => e.side === 'home')
  const awayEvents = timeline.filter(e => e.side === 'away')

  return (
    <div className={`mx-row${played ? ' played' : ''}${isLive ? ' live' : ''}`}>
      <div className="mx-team-cell left">
        {url1 ? <img src={url1} alt={ab(m.team1)} className="mx-flag" onError={e => { e.target.style.display='none' }} /> : null}
        <span className={`mx-name${win1 ? ' win' : ''} st-${statusMap?.[m.team1] || 'tbd'}`}>{ab(m.team1)}</span>
        {homeEvents.length > 0 && (
          <div className="mx-row-events home">
            {homeEvents.map((e, i) => (
              <span key={i} className="mx-row-evt">
                {e.player && <>{e.player} </>}<EventIcon type={e.type} />{e.min && <> {e.min}</>}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="mx-center">
        {isLive && <div className="mx-live-slider" />}
        {isLive && <span className="mx-live-pip" />}
        {isLive && fifaInfo?.clock && (
          <span className="mx-live-match-clock">{fifaInfo.clock}</span>
        )}
        {/* FT badge above score — only for current day card */}
        {played && isCurrent && <span className="mx-ft-badge above">FT</span>}
        {played
          ? <span className="mx-score">{ds1}–{ds2}</span>
          : isLive && fifaInfo?.liveScore
            ? <span className="mx-score mx-score-live">{fifaInfo.liveScore[0]}–{fifaInfo.liveScore[1]}</span>
            : <span className="mx-vs">vs</span>}
        {/* Time + venue for all cards */}
        {!isLive && !played && (localTime || venue) && (
          <div className="mx-match-detail">
            {localTime && <span className="mx-match-time">{localTime}</span>}
            {venue && <span className="mx-match-venue">{venue}</span>}
          </div>
        )}
      </div>
      <div className="mx-team-cell right">
        {awayEvents.length > 0 && (
          <div className="mx-row-events away">
            {awayEvents.map((e, i) => (
              <span key={i} className="mx-row-evt">
                {e.min && <>{e.min} </>}<EventIcon type={e.type} />{e.player && <> {e.player}</>}
              </span>
            ))}
          </div>
        )}
        <span className={`mx-name${win2 ? ' win' : ''} st-${statusMap?.[m.team2] || 'tbd'}`}>{ab(m.team2)}</span>
        {url2 ? <img src={url2} alt={ab(m.team2)} className="mx-flag" onError={e => { e.target.style.display='none' }} /> : null}
      </div>
    </div>
  )
}

function ordinal(n) {
  if ([11,12,13].includes(n % 100)) return `${n}th`
  if (n % 10 === 1) return `${n}st`
  if (n % 10 === 2) return `${n}nd`
  if (n % 10 === 3) return `${n}rd`
  return `${n}th`
}

// ── Matchday block ────────────────────────────────────────────
function RoundBlock({ roundName, ms, highlight, showDetails, fifaMap, statusMap, timelines }) {
  const played = ms.filter(m => m.score?.ft).length

  let roundDateStr = null
  for (const m of ms) {
    const fifa = fifaMap?.[abKey(m.team1, m.team2)]
    if (fifa?.date) {
      try {
        const d = new Date(fifa.date)
        const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'America/Los_Angeles' }).format(d)
        const day   = parseInt(new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'America/Los_Angeles' }).format(d))
        roundDateStr = `${month} ${ordinal(day)}`
      } catch {}
      break
    }
  }

  return (
    <div className={`mx-block${highlight ? ' current' : ''}`}>
      <div className="mx-block-hdr">
        <span className="mx-rnd-name">{roundName}</span>
        <span className="mx-rnd-progress">{played}/{ms.length}</span>
      </div>
      {roundDateStr && <div className="mx-rnd-date">{roundDateStr}</div>}
      <div className="mx-block-matches">
        {ms.map((m, i) => (
          <MatchRow
            key={i} m={m}
            showDetails={showDetails}
            isCurrent={highlight}
            fifaInfo={fifaMap?.[abKey(m.team1, m.team2)]}
            statusMap={statusMap}
            timelines={timelines}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────
function roundNum(r) {
  const m = r?.match(/\d+/)
  return m ? +m[0] : 999
}

export default function Matches({ matches, groups, onLiveChange }) {
  const [fifaMap, setFifaMap]                 = useState({})
  const [liveMatches, setLiveMatches]         = useState([])   // flat live-match objects
  const [timelines, setTimelines]             = useState({})
  const [lineups, setLineups]                 = useState({})
  const [currentLiveIdx, setCurrentLiveIdx]   = useState(0)
  const fetchedKeys                           = useRef(new Set())

  // Cycle between live games every 20s
  useEffect(() => {
    if (liveMatches.length <= 1) return
    const t = setInterval(() => setCurrentLiveIdx(i => (i + 1) % liveMatches.length), 20_000)
    return () => clearInterval(t)
  }, [liveMatches.length])

  useEffect(() => { setCurrentLiveIdx(0) }, [liveMatches.length])

  useEffect(() => {
    const load = async () => {
      // ── Stage 1: FIFA Calendar ────────────────────────────────
      let calResults = []
      try {
        const calD = await fetch(FIFA_CALENDAR).then(r => r.json())
        calResults = calD.Results || []
      } catch { return }

      // Build match map keyed by sorted FIFA abbreviations
      const map = {}
      for (const m of calResults) {
        const hAbbr = (m.HomeTeam?.Abbreviation || '').toUpperCase()
        const aAbbr = (m.AwayTeam?.Abbreviation || '').toUpperCase()
        if (!hAbbr || !aAbbr) continue
        const key = rawAbKey(hAbbr, aAbbr)
        const s = m.MatchStatus  // 0=upcoming, 3=live, ≥4=finished
        const state = s === 3 ? 'in' : s >= 4 ? 'post' : 'pre'
        const scores = [m.HomeTeam.Score ?? 0, m.AwayTeam.Score ?? 0]
        map[key] = {
          mk: `${m.IdStage}/${m.IdMatch}`,
          idStage: m.IdStage,
          idMatch: m.IdMatch,
          date: m.Date,
          venue: m.Stadium?.Name?.[0]?.Description || m.Stadium?.CityName?.[0]?.Description || '',
          state,
          clock: m.MatchTime || '',
          liveScore: state === 'in' ? scores : null,
          postScore: state === 'post' ? scores : null,
        }
      }
      setFifaMap(map)

      // ── Stage 2: Live matches ─────────────────────────────────
      const live = calResults
        .filter(m => m.MatchStatus === 3)
        .map(m => ({
          mk:        `${m.IdStage}/${m.IdMatch}`,
          idStage:   m.IdStage,
          idMatch:   m.IdMatch,
          homeAbbr:  (m.HomeTeam?.Abbreviation || '').toUpperCase(),
          awayAbbr:  (m.AwayTeam?.Abbreviation || '').toUpperCase(),
          homeScore: m.HomeTeam?.Score ?? 0,
          awayScore: m.AwayTeam?.Score ?? 0,
          clock:     m.MatchTime || '?',
          isHT:      m.MatchTime === 'HT',
        }))
      setLiveMatches(live)

      const newTimelines = {}
      const newLineups   = {}

      // Fetch live match details (events + lineups) from FIFA live endpoint
      await Promise.all(live.map(async lm => {
        try {
          const fd = await fetch(FIFA_LIVE(lm.idStage, lm.idMatch)).then(r => r.json())
          newTimelines[lm.mk] = parseFifaEventsFromTeams(fd)
          newLineups[lm.mk]   = parseFifaLineup(fd)
        } catch { newTimelines[lm.mk] = [] }
      }))

      // ── Stage 3: Completed match timelines ────────────────────
      const completed = calResults.filter(
        m => m.MatchStatus >= 4 && !fetchedKeys.current.has(`${m.IdStage}/${m.IdMatch}`)
      )

      // Collect ESPN IDs as fallback (one scoreboard call covers recent matches)
      const espnIdMap = {}
      if (completed.length > 0) {
        try {
          const ptDate = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' })
            .format(new Date(Date.now() + offset * 86400000)).replace(/-/g, '')
          const [rY, rT, rTm] = await Promise.all([
            fetch(`${ESPN_SCOREBOARD}?dates=${ptDate(-1)}`),
            fetch(`${ESPN_SCOREBOARD}?dates=${ptDate(0)}`),
            fetch(`${ESPN_SCOREBOARD}?dates=${ptDate(1)}`),
          ])
          const espnEvts = [
            ...((await rY.json()).events || []),
            ...((await rT.json()).events || []),
            ...((await rTm.json()).events || []),
          ]
          for (const ev of espnEvts) {
            const comp = ev.competitions?.[0]
            const h = comp?.competitors?.find(c => c.homeAway === 'home')?.team?.abbreviation?.toUpperCase()
            const a = comp?.competitors?.find(c => c.homeAway === 'away')?.team?.abbreviation?.toUpperCase()
            if (h && a) espnIdMap[rawAbKey(h, a)] = ev.id
          }
        } catch {}
      }

      await Promise.all(completed.map(async m => {
        const mk = `${m.IdStage}/${m.IdMatch}`

        // Try FIFA timeline endpoint first
        try {
          const fd = await fetch(FIFA_TIMELINE(m.IdStage, m.IdMatch)).then(r => r.json())
          const events = parseFifaTimeline(fd)
          if (events.length > 0) {
            newTimelines[mk] = events
            fetchedKeys.current.add(mk)
            return
          }
        } catch {}

        // Fallback A: FIFA live endpoint (retains data for recently completed matches)
        try {
          const fd = await fetch(FIFA_LIVE(m.IdStage, m.IdMatch)).then(r => r.json())
          const events = parseFifaEventsFromTeams(fd)
          if (events.length > 0) {
            newTimelines[mk] = events
            fetchedKeys.current.add(mk)
            return
          }
        } catch {}

        // Fallback B: ESPN summary
        const hAbbr = (m.HomeTeam?.Abbreviation || '').toUpperCase()
        const aAbbr = (m.AwayTeam?.Abbreviation || '').toUpperCase()
        const espnId = espnIdMap[rawAbKey(hAbbr, aAbbr)]
        if (espnId) {
          try {
            const d2 = await fetch(ESPN_SUMMARY(espnId)).then(r => r.json())
            newTimelines[mk] = parseEspnTimeline(d2)
            fetchedKeys.current.add(mk)
          } catch { fetchedKeys.current.add(mk) }
        } else {
          fetchedKeys.current.add(mk)
        }
      }))

      setTimelines(prev => ({ ...prev, ...newTimelines }))
      if (Object.keys(newLineups).length) setLineups(prev => ({ ...prev, ...newLineups }))
    }

    load()
    const iv = setInterval(load, 10_000)
    return () => clearInterval(iv)
  }, [])

  // Augment static matches with FIFA-confirmed completions
  const augMatches = useMemo(() => matches.map(m => {
    if (m.score?.ft) return m
    const fifa = fifaMap[abKey(m.team1, m.team2)]
    if (fifa?.state === 'post' && fifa?.postScore) {
      return { ...m, score: { ...m.score, ft: fifa.postScore } }
    }
    return m
  }), [matches, fifaMap])

  const { rounds, activeIdx } = useMemo(() => {
    const byRound = {}
    for (const m of augMatches.filter(m => m.group)) {
      if (!byRound[m.round]) byRound[m.round] = []
      byRound[m.round].push(m)
    }
    const rounds = Object.entries(byRound).sort((a, b) => roundNum(a[0]) - roundNum(b[0]))

    const todayPT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date())
    const ptDay = (iso) => {
      try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(iso)) }
      catch { return '' }
    }

    const todayIdx = rounds.findIndex(([, ms]) =>
      ms.some(m => {
        const fifa = fifaMap[abKey(m.team1, m.team2)]
        return fifa?.date && ptDay(fifa.date) === todayPT
      })
    )
    if (todayIdx >= 0) return { rounds, activeIdx: todayIdx }

    let activeIdx = rounds.findIndex(([, ms]) => ms.some(m => !m.score?.ft))
    if (activeIdx < 0) activeIdx = rounds.length - 1
    return { rounds, activeIdx }
  }, [augMatches, fifaMap])

  const visible = useMemo(() => {
    const out = []
    for (const i of [activeIdx - 1, activeIdx, activeIdx + 1]) {
      if (i >= 0 && i < rounds.length) out.push({ round: rounds[i], idx: i })
    }
    return out
  }, [rounds, activeIdx])

  const statusMap = useMemo(() => buildTeamStatusMap(computeGroups(augMatches)), [augMatches])

  const hasLive = liveMatches.length > 0
  const liveCount = liveMatches.length
  useEffect(() => { onLiveChange?.(hasLive) }, [hasLive, onLiveChange])
  const safeIdx = Math.min(currentLiveIdx, Math.max(liveCount - 1, 0))
  const currentLive = liveMatches[safeIdx]

  return (
    <div className="mx-outer">
      <div className={`mx-schedule-row${hasLive ? '' : ' no-live'}`}>
        {visible.map(({ round: [name, ms], idx }) => (
          <RoundBlock
            key={name}
            roundName={name}
            ms={ms}
            highlight={idx === activeIdx}
            showDetails={idx === activeIdx || idx === activeIdx - 1}
            fifaMap={fifaMap}
            statusMap={idx <= activeIdx ? statusMap : undefined}
            timelines={timelines}
          />
        ))}
      </div>

      {hasLive && (
        <div className="mx-live-section">
          <div className="mx-live-section-label">
            <span className="mx-live-dot" />
            LIVE NOW — {liveCount} match{liveCount > 1 ? 'es' : ''}
            {liveCount > 1 && (
              <span className="mx-live-game-dots">
                {liveMatches.map((_, i) => (
                  <button
                    key={i}
                    className={`mx-live-game-dot${i === safeIdx ? ' on' : ''}`}
                    onClick={() => setCurrentLiveIdx(i)}
                  />
                ))}
              </span>
            )}
          </div>
          {currentLive && (
            <LiveMatchTile
              key={currentLive.mk}
              event={currentLive}
              timeline={timelines[currentLive.mk] || []}
              lineup={lineups[currentLive.mk]}
            />
          )}
        </div>
      )}
    </div>
  )
}
