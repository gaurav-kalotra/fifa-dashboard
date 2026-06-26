import { useMemo, useState, useEffect, useRef } from 'react'
import { ab, flagUrl, buildTeamStatusMap, computeGroups } from '../utils'

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'
const ESPN_SUMMARY    = id => `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${id}`

const FIFA_SEASON     = '285023'
const FIFA_LIVE_LIST  = `https://api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason=${FIFA_SEASON}&language=en&matchStatus=3&count=20`
const FIFA_LIVE       = (stageId, matchId) => `https://api.fifa.com/api/v3/live/football/17/${FIFA_SEASON}/${stageId}/${matchId}?language=en`
const FIFA_POS_ABBR   = { 0:'GK', 1:'D', 2:'M', 3:'F' }

function normalTeam(n = '') {
  return n.toLowerCase()
    .replace(/united states/i, 'usa')
    .replace(/türkiye/i, 'turkey')
    .replace(/\./g, '').replace(/[^a-z0-9]/g, '')
}
function teamsKey(t1, t2) {
  const a = [normalTeam(t1), normalTeam(t2)].sort()
  return a.join('|')
}

// CSS-styled card component for match event display
function EventIcon({ type }) {
  const t = (type || '').toLowerCase()
  if (t.includes('owngoal') || t.includes('own')) return <><span className="mx-evt-icon">⚽</span><sup className="mx-og-sup">og</sup></>
  if (t.includes('goal') || t === 'goal' || t === 'pen') return <span className="mx-evt-icon">⚽</span>
  if (t.includes('yellow') && t.includes('red')) return <span className="mx-evt-card" style={{background:'linear-gradient(135deg,#fbbf24 50%,#ef4444 50%)'}} />
  if (t.includes('yellow')) return <span className="mx-evt-card yellow" />
  if (t.includes('red')) return <span className="mx-evt-card red" />
  return <span>•</span>
}

function parseTimeline(summary, homeTeamId, awayTeamId) {
  const seen = new Set()
  const items = [
    ...(summary?.plays || []),
    ...(summary?.keyEvents || []),
    ...(summary?.scoringPlays || []),
    ...(summary?.keyPlays || []),
  ].filter(p => { const k = p.id ?? JSON.stringify(p); return seen.has(k) ? false : (seen.add(k), true) })

  const out = []
  for (const p of items) {
    const typeId   = String(p.type?.id   || '').toLowerCase()
    const typeText = String(p.type?.text || p.type?.name || '').toLowerCase()
    const isGoal = typeText.includes('goal') || typeId === '70' || typeId === '72' || typeText === 'score'
    const isCard = typeText.includes('yellow') || typeText.includes('red') || ['93','94','95'].includes(typeId)
    const isPen  = typeText.includes('pen') || typeId === '72'
    if (!isGoal && !isCard && !isPen) continue

    const dispVal = p.clock?.displayValue
    const secVal  = p.clock?.value
    let min = ''
    if (dispVal) {
      min = String(parseInt(dispVal) || dispVal.split(':')[0] || '')
    } else if (typeof secVal === 'number') {
      min = String(Math.floor(secVal / 60))
    }

    const scorer = p.participants?.find(x =>
      (x.type?.id === 'scorer' || x.type?.id === '1' ||
       (x.type?.text || '').toLowerCase().includes('scorer'))
    )
    const player =
      scorer?.athlete?.displayName
      || p.participants?.[0]?.athlete?.displayName
      || p.athlete?.displayName
      || (p.text || '').match(/[-–]\s*([^(,\n]+?)(?:\s*[\(,]|$)/)?.[1]?.trim()
      || ''

    const teamId = String(p.team?.id || '')
    const side = homeTeamId && teamId === String(homeTeamId) ? 'home'
               : awayTeamId && teamId === String(awayTeamId) ? 'away'
               : ''

    out.push({
      min,
      type: isGoal ? 'goal' : isCard ? (typeText.includes('red') ? 'red' : 'yellow') : 'pen',
      player,
      side,
    })
  }
  return out.sort((a, b) => (parseInt(a.min) || 0) - (parseInt(b.min) || 0))
}

// Position row: 0=FWD 1=MID 2=DEF 3=GK
const POS_ROW_BASE = {
  G:3, GK:3,
  CD:2, CB:2, LB:2, RB:2, LWB:2, RWB:2, SW:2, D:2, WB:2,
  CM:1, DM:1, CDM:1, CAM:1, AM:1, LM:1, RM:1, M:1, LW:1, RW:1, WM:1,
  ST:0, CF:0, SS:0, FW:0, F:0, ATT:0, LF:0, RF:0,
}
function posRow(pos = '') {
  const base = pos.toUpperCase().split('-')[0]
  return POS_ROW_BASE[base] ?? 1
}

function parseFifaLineup(data) {
  const result = { home:[], away:[], homeCoach:'', awayCoach:'', homeFormation:'', awayFormation:'' }
  for (const [side, td] of [['home', data?.HomeTeam], ['away', data?.AwayTeam]]) {
    if (!td) continue
    const formation = td.Tactics || ''
    const hc = (td.Coaches || []).find(c => c.Role === 1) || td.Coaches?.[0]
    const coach = hc?.Name?.[0]?.Description || ''
    const allFifaPlayers = td.Players || []
    const fifaStarters = allFifaPlayers.filter(p => p.Status === 1)
    const fifaUsed = fifaStarters.length > 0 ? fifaStarters : allFifaPlayers.filter(p => p.Status <= 2).slice(0, 11)
    const players = fifaUsed
      .map(p => ({
        id: p.IdPlayer,
        name: p.ShortName?.[0]?.Description || p.PlayerName?.[0]?.Description || '',
        jersey: String(p.ShirtNumber ?? ''),
        pos: FIFA_POS_ABBR[p.Position] || 'M',
        photo: p.PlayerPicture?.PictureUrl || null,
        jerseyImg: null,
        formationPlace: 99,
        rating: null,
      }))
    if (side === 'home') { result.home = players; result.homeFormation = formation; result.homeCoach = coach }
    else                 { result.away = players; result.awayFormation = formation; result.awayCoach = coach }
  }
  return result
}

function parseLineup(summary, eventId) {
  const result = { home:[], away:[], homeCoach:'', awayCoach:'', homeFormation:'', awayFormation:'' }
  for (const roster of summary?.rosters || []) {
    const side = roster.homeAway
    if (side === 'home') result.homeFormation = roster.formation || ''
    else result.awayFormation = roster.formation || ''
    const allPlayers = roster.roster || []
    const starters = allPlayers.filter(p => p.starter)
    const players = (starters.length > 0 ? starters : allPlayers.filter(p => p.active).slice(0, 11))
      .map(p => {
        const aid = p.athlete?.id
        const headshot = aid ? `https://a.espncdn.com/i/headshots/soccer/players/full/${aid}.png` : null
        const jerseyImg = aid && eventId
          ? `https://stitcher.espn.com/sports/soccer/leagues/fifa.world/events/${eventId}/athletes/${aid}/jersey.png?darkMode=false`
          : null
        return {
          id: aid,
          name: p.athlete?.shortName || p.athlete?.displayName || '',
          jersey: p.jersey || '',
          pos: p.position?.abbreviation || '',
          photo: headshot,
          jerseyImg,
          formationPlace: parseInt(p.formationPlace) || 99,
          rating: null,
        }
      })
      .sort((a, b) => a.formationPlace - b.formationPlace)
    if (side === 'home') result.home = players
    else result.away = players
  }
  return result
}

function fmtLocalTime(isoDate) {
  if (!isoDate) return null
  try {
    const d = new Date(isoDate)
    if (isNaN(d)) return null
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch { return null }
}

// Normalize name for fuzzy matching: strip accents, lowercase, letters only
function normName(n = '') {
  return n.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
}

// Annotate players with goal/card counts from timeline events (name-match)
function annotatePlayerEvents(players, events) {
  return players.map(p => {
    const pWords = (p.name || '').split(/\s+/).map(normName).filter(w => w.length > 2)
    const mine = events.filter(e => {
      const eWords = (e.player || '').split(/\s+/).map(normName).filter(w => w.length > 2)
      return eWords.some(ew => pWords.includes(ew))
    })
    return {
      ...p,
      goals:   mine.filter(e => e.type === 'goal').length,
      yellows: mine.filter(e => e.type === 'yellow').length,
      reds:    mine.filter(e => e.type === 'red').length,
    }
  })
}

// ── Match row ─────────────────────────────────────────────────
function MatchRow({ m, showDetails, espnInfo, statusMap, timelines }) {
  const ft = m.score?.ft
  const espnState = espnInfo?.state
  const displayScore = ft || (espnState === 'post' ? espnInfo?.postScore : null)
  const [ds1, ds2] = displayScore || []
  const played = !!displayScore
  const isLive = !played && espnState === 'in'
  const win1 = played && ds1 > ds2
  const win2 = played && ds2 > ds1
  const url1 = flagUrl(m.team1)
  const url2 = flagUrl(m.team2)
  const localTime = espnInfo ? fmtLocalTime(espnInfo.date) : null
  const venue = espnInfo?.venue
  const timeline = showDetails && (played || isLive) ? (timelines?.[espnInfo?.id] || []) : []
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
        {isLive && espnInfo?.clock && (
          <span className="mx-live-match-clock">{espnInfo.clock}</span>
        )}
        {played
          ? <><span className="mx-score">{ds1}–{ds2}</span><span className="mx-ft-badge">FT</span></>
          : isLive && espnInfo?.liveScore
            ? <span className="mx-score mx-score-live">{espnInfo.liveScore[0]}–{espnInfo.liveScore[1]}</span>
            : <span className="mx-vs">vs</span>}
        {!isLive && !played && showDetails && (localTime || venue) && (
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
function RoundBlock({ roundName, ms, highlight, showDetails, espnMap, statusMap, timelines }) {
  const played = ms.filter(m => m.score?.ft).length

  // Get the date of the first match with an ESPN date (in Pacific Time)
  let roundDateStr = null
  for (const m of ms) {
    const espn = espnMap?.[teamsKey(m.team1, m.team2)]
    if (espn?.date) {
      try {
        const d = new Date(espn.date)
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
            espnInfo={espnMap?.[teamsKey(m.team1, m.team2)]}
            statusMap={statusMap}
            timelines={timelines}
          />
        ))}
      </div>
    </div>
  )
}

// ── Pitch player marker ───────────────────────────────────────
// Horizontal layout: players arranged in columns by position across the pitch width
// posRow: 0=FWD 1=MID 2=DEF 3=GK
// Home: GK far-left → FWD far-right (near center divider)
const COL_X_HOME = [80, 55, 32, 10]
// Away: FWD far-left (near center divider) → GK far-right
const COL_X_AWAY = [20, 45, 68, 90]

function PitchPlayer({ player, x, y }) {
  const [photoState, setPhotoState] = useState('headshot')
  const jerseyName = player.name ? player.name.split(/\s+/).slice(-1)[0] : player.jersey

  const src = photoState === 'headshot' ? player.photo
             : photoState === 'jersey'  ? player.jerseyImg
             : null
  const onErr = () => setPhotoState(s => s === 'headshot' ? 'jersey' : 'none')

  const ratingClass = player.rating
    ? +player.rating >= 7.5 ? 'r-great' : +player.rating >= 6.5 ? 'r-ok' : 'r-bad'
    : null

  const hasEvents = (player.goals > 0) || (player.yellows > 0) || (player.reds > 0)

  return (
    <div className="mx-pp" style={{ left:`${x}%`, top:`${y}%` }}>
      <div className="mx-pp-photo">
        {src
          ? <img src={src} alt="" onError={onErr} className="mx-pp-img" />
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

// Half-pitch: horizontal column layout — GK at far end, FWD near center divider
function HalfPitch({ players, side = 'home' }) {
  const colX = side === 'home' ? COL_X_HOME : COL_X_AWAY
  // Group by posRow (0=FWD,1=MID,2=DEF,3=GK)
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
function LiveMatchTile({ event, timeline, lineup }) {
  const comp   = event.competitions?.[0]
  const home   = comp?.competitors?.find(c => c.homeAway === 'home')
  const away   = comp?.competitors?.find(c => c.homeAway === 'away')
  const clock  = event.status?.displayClock || '?'
  const detail = (event.status?.type?.shortDetail || '').toLowerCase()
  const isHT   = detail.includes('half') || detail === 'ht'

  const homeScore = parseInt(home?.score ?? '0')
  const awayScore = parseInt(away?.score ?? '0')
  const homeAbbr  = home?.team?.abbreviation || home?.team?.shortDisplayName || '?'
  const awayAbbr  = away?.team?.abbreviation || away?.team?.shortDisplayName || '?'
  const homeName  = home?.team?.displayName || homeAbbr
  const awayName  = away?.team?.displayName || awayAbbr

  const homeEvts = timeline.filter(e => e.side === 'home')
  const awayEvts = timeline.filter(e => e.side === 'away')

  const homePlayers = annotatePlayerEvents(lineup?.home || [], homeEvts)
  const awayPlayers = annotatePlayerEvents(lineup?.away || [], awayEvts)

  return (
    <div className="mx-live-tile">
      {/* Score bar */}
      <div className="mx-live-hdr">
        <span className="mx-live-badge"><span className="mx-live-dot" />LIVE</span>
        <div className="mx-live-scorebar">
          <img src={flagUrl(homeName)} alt={homeAbbr} className="mx-sb-flag" onError={e=>{e.target.style.display='none'}} />
          <span className="mx-sb-abbr">{homeAbbr}</span>
          <span className={`mx-sb-score${homeScore > awayScore ? ' lead' : ''}`}>{homeScore}</span>
          <span className="mx-sb-sep">{isHT ? 'HT' : clock}</span>
          <span className={`mx-sb-score${awayScore > homeScore ? ' lead' : ''}`}>{awayScore}</span>
          <span className="mx-sb-abbr">{awayAbbr}</span>
          <img src={flagUrl(awayName)} alt={awayAbbr} className="mx-sb-flag" onError={e=>{e.target.style.display='none'}} />
        </div>
      </div>

      {/* Side-by-side squad panels */}
      <div className="mx-live-squads">
        {/* Home side */}
        <div className="mx-live-side">
          <div className="mx-live-side-hdr">
            <img src={flagUrl(homeName)} alt="" className="mx-side-flag" onError={e=>{e.target.style.display='none'}} />
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

        {/* Away side */}
        <div className="mx-live-side">
          <div className="mx-live-side-hdr right">
            {lineup?.awayFormation && <span className="mx-side-fmtn">{lineup.awayFormation}</span>}
            <span className="mx-side-abbr">{awayAbbr}</span>
            <img src={flagUrl(awayName)} alt="" className="mx-side-flag" onError={e=>{e.target.style.display='none'}} />
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

// ── Main export ───────────────────────────────────────────────
function roundNum(r) {
  const m = r?.match(/\d+/)
  return m ? +m[0] : 999
}

export default function Matches({ matches, groups, onLiveChange }) {
  const [espnMap, setEspnMap]             = useState({})
  const [liveEvents, setLiveEvents]       = useState([])
  const [timelines, setTimelines]         = useState({})
  const [lineups, setLineups]             = useState({})
  const [currentLiveIdx, setCurrentLiveIdx] = useState(0)
  const fetchedCompletedIds               = useRef(new Set())

  // Cycle between live games every 20 seconds
  useEffect(() => {
    if (liveEvents.length <= 1) return
    const t = setInterval(() => setCurrentLiveIdx(i => (i + 1) % liveEvents.length), 20_000)
    return () => clearInterval(t)
  }, [liveEvents.length])

  // Reset index when game count changes
  useEffect(() => { setCurrentLiveIdx(0) }, [liveEvents.length])

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(ESPN_SCOREBOARD)
        const d = await r.json()
        const events = d.events || []

        const map = {}
        for (const ev of events) {
          const comp = ev.competitions?.[0]
          const [h, a] = comp?.competitors || []
          if (!h || !a) continue
          const key = teamsKey(h.team?.displayName || '', a.team?.displayName || '')
          const state = ev.status?.type?.state
          const scores = [parseInt(h.score ?? '0'), parseInt(a.score ?? '0')]
          map[key] = {
            id: ev.id,
            date: ev.date,
            venue: comp.venue?.fullName || comp.venue?.shortName || '',
            state,
            clock: ev.status?.displayClock,
            liveScore: state === 'in'  ? scores : null,
            postScore: state === 'post' ? scores : null,
          }
        }
        setEspnMap(map)

        const live = events.filter(e => e.status?.type?.state === 'in')
        setLiveEvents(live)

        const newTimelines = {}
        const newLineups   = {}

        await Promise.all(live.map(async ev => {
          try {
            const comp = ev.competitions?.[0]
            const homeComp = comp?.competitors?.find(c => c.homeAway === 'home')
            const awayComp = comp?.competitors?.find(c => c.homeAway === 'away')
            const r2 = await fetch(ESPN_SUMMARY(ev.id))
            const d2 = await r2.json()
            newTimelines[ev.id] = parseTimeline(d2, homeComp?.team?.id, awayComp?.team?.id)
            newLineups[ev.id]   = parseLineup(d2, ev.id)
          } catch { newTimelines[ev.id] = [] }
        }))

        // Fetch FIFA live data for better photos, coach, formation
        try {
          const fifaList = await fetch(FIFA_LIVE_LIST).then(r => r.json())
          const abbrMap = {}
          for (const ev of live) {
            const comp = ev.competitions?.[0]
            const h = comp?.competitors?.find(c => c.homeAway === 'home')?.team?.abbreviation?.toUpperCase()
            const a = comp?.competitors?.find(c => c.homeAway === 'away')?.team?.abbreviation?.toUpperCase()
            if (h && a) abbrMap[[h,a].sort().join('|')] = ev.id
          }
          await Promise.all((fifaList.Results || []).map(async fm => {
            try {
              const fd = await fetch(FIFA_LIVE(fm.IdStage, fm.IdMatch)).then(r => r.json())
              const h = fd.HomeTeam?.Abbreviation?.toUpperCase()
              const a = fd.AwayTeam?.Abbreviation?.toUpperCase()
              const espnId = h && a ? abbrMap[[h,a].sort().join('|')] : null
              if (espnId) newLineups[espnId] = parseFifaLineup(fd)
            } catch {}
          }))
        } catch {}

        const newlyCompleted = events.filter(
          e => e.status?.type?.state === 'post' && !fetchedCompletedIds.current.has(e.id)
        )
        await Promise.all(newlyCompleted.map(async ev => {
          try {
            const comp = ev.competitions?.[0]
            const homeComp = comp?.competitors?.find(c => c.homeAway === 'home')
            const awayComp = comp?.competitors?.find(c => c.homeAway === 'away')
            const r2 = await fetch(ESPN_SUMMARY(ev.id))
            const d2 = await r2.json()
            newTimelines[ev.id] = parseTimeline(d2, homeComp?.team?.id, awayComp?.team?.id)
            fetchedCompletedIds.current.add(ev.id)
          } catch {}
        }))

        setTimelines(prev => ({ ...prev, ...newTimelines }))
        if (Object.keys(newLineups).length) setLineups(prev => ({ ...prev, ...newLineups }))
      } catch {}
    }

    load()
    const iv = setInterval(load, 10_000)
    return () => clearInterval(iv)
  }, [])

  // Augment static matches with ESPN-confirmed completions not yet in the feed
  const augMatches = useMemo(() => matches.map(m => {
    if (m.score?.ft) return m
    const espn = espnMap[teamsKey(m.team1, m.team2)]
    if (espn?.state === 'post' && espn?.postScore) {
      return { ...m, score: { ...m.score, ft: espn.postScore } }
    }
    return m
  }), [matches, espnMap])

  const { rounds, activeIdx } = useMemo(() => {
    const byRound = {}
    for (const m of augMatches.filter(m => m.group)) {
      if (!byRound[m.round]) byRound[m.round] = []
      byRound[m.round].push(m)
    }
    const rounds = Object.entries(byRound).sort((a, b) => roundNum(a[0]) - roundNum(b[0]))

    // Today's date in Pacific Time (stays the same until midnight PT)
    const todayPT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date())
    // 'en-CA' gives YYYY-MM-DD which matches ESPN ISO date prefixes

    const ptDay = (isoDate) => {
      try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(isoDate))
      } catch { return '' }
    }

    // Prefer the round whose ESPN match dates fall on today (PT) — even if all done
    const todayIdx = rounds.findIndex(([, ms]) =>
      ms.some(m => {
        const espn = espnMap[teamsKey(m.team1, m.team2)]
        return espn?.date && ptDay(espn.date) === todayPT
      })
    )
    if (todayIdx >= 0) return { rounds, activeIdx: todayIdx }

    // No today-matches found — first round with unplayed matches
    let activeIdx = rounds.findIndex(([, ms]) => ms.some(m => !m.score?.ft))
    if (activeIdx < 0) activeIdx = rounds.length - 1
    return { rounds, activeIdx }
  }, [augMatches, espnMap])

  const visible = useMemo(() => {
    const out = []
    for (const i of [activeIdx - 1, activeIdx, activeIdx + 1]) {
      if (i >= 0 && i < rounds.length) out.push({ round: rounds[i], idx: i })
    }
    return out
  }, [rounds, activeIdx])

  const statusMap = useMemo(() => buildTeamStatusMap(computeGroups(augMatches)), [augMatches])

  const hasLive = liveEvents.length > 0
  const liveCount = liveEvents.length
  useEffect(() => { onLiveChange?.(hasLive) }, [hasLive, onLiveChange])
  const safeIdx = Math.min(currentLiveIdx, Math.max(liveCount - 1, 0))
  const currentLiveEvent = liveEvents[safeIdx]

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
            espnMap={espnMap}
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
                {liveEvents.map((_, i) => (
                  <button
                    key={i}
                    className={`mx-live-game-dot${i === safeIdx ? ' on' : ''}`}
                    onClick={() => setCurrentLiveIdx(i)}
                  />
                ))}
              </span>
            )}
          </div>
          {currentLiveEvent && (
            <LiveMatchTile
              key={currentLiveEvent.id}
              event={currentLiveEvent}
              timeline={timelines[currentLiveEvent.id] || []}
              lineup={lineups[currentLiveEvent.id]}
            />
          )}
        </div>
      )}
    </div>
  )
}
