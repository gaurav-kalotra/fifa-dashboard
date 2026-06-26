import { useMemo, useState, useEffect, useRef } from 'react'
import { ab, flagUrl, buildTeamStatusMap } from '../utils'

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'
const ESPN_SUMMARY = id => `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${id}`

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

function eventIcon(type = '') {
  const t = type.toLowerCase()
  if (t.includes('owngoal') || t.includes('own')) return '🥅'
  if (t.includes('goal') || t === 'goal') return '⚽'
  if (t.includes('yellow') && t.includes('red')) return '🟧'
  if (t.includes('yellow')) return '🟨'
  if (t.includes('red')) return '🟥'
  if (t.includes('pen')) return '⚽ pen'
  return '•'
}

function parseTimeline(summary, homeTeamId, awayTeamId) {
  // ESPN uses different field names across endpoints — try all of them
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
    // ESPN soccer type IDs: 70=goal, 72=penalty goal, 93=yellow, 94=red, 95=double-yellow
    const isGoal = typeText.includes('goal') || typeId === '70' || typeId === '72' || typeText === 'score'
    const isCard = typeText.includes('yellow') || typeText.includes('red') || ['93','94','95'].includes(typeId)
    const isPen  = typeText.includes('pen') || typeId === '72'
    if (!isGoal && !isCard && !isPen) continue

    // Prefer displayValue ("23:00") over raw seconds value
    const dispVal = p.clock?.displayValue
    const secVal  = p.clock?.value
    let min = ''
    if (dispVal) {
      min = String(parseInt(dispVal) || dispVal.split(':')[0] || '')
    } else if (typeof secVal === 'number') {
      min = String(Math.floor(secVal / 60))
    }

    // Try multiple participant paths, then fall back to parsing p.text
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

    // Match team by ID (most reliable) then fall back to abbreviation
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

// Position row: 0=FWD 1=MID 2=DEF 3=GK (top→bottom on pitch)
const POS_ROW = {
  GK:3, G:3,
  CB:2, CD:2, LB:2, RB:2, LWB:2, RWB:2, SW:2, D:2, WB:2,
  DM:1, CDM:1, CM:1, CAM:1, AM:1, LM:1, RM:1, M:1, LW:1, RW:1,
  ST:0, CF:0, SS:0, FW:0, F:0, ATT:0,
}
function posRow(pos = '') { return POS_ROW[pos.toUpperCase()] ?? 1 }

function parseLineup(summary) {
  const comp = summary?.header?.competitions?.[0]
  const result = { home:[], away:[], homeCoach:'', awayCoach:'', homeFormation:'', awayFormation:'' }

  // Primary: competition lineups array
  for (const lineup of comp?.lineups || []) {
    const side = lineup.homeAway
    if (side === 'home') result.homeFormation = lineup.formation || ''
    else result.awayFormation = lineup.formation || ''
    const players = (lineup.athletes || [])
      .filter(a => a.starter !== false)
      .map(a => ({
        id: a.athlete?.id,
        name: a.athlete?.shortName || a.athlete?.displayName || '',
        jersey: a.jersey || a.athlete?.jersey || '',
        pos: a.position?.abbreviation || a.athlete?.position?.abbreviation || '',
        photo: a.athlete?.headshot?.href
          || (a.athlete?.id ? `https://a.espncdn.com/i/headshots/soccer/players/full/${a.athlete.id}.png` : null),
        formationPlace: a.formationPlace || 99,
        rating: a.rating != null ? Number(a.rating).toFixed(1) : null,
      }))
      .sort((a, b) => a.formationPlace - b.formationPlace)
    if (side === 'home') result.home = players
    else result.away = players
  }

  // Fallback: boxscore starters
  if (!result.home.length) {
    for (const team of summary?.boxscore?.players || []) {
      const side = team.homeAway
      const players = (team.statistics?.[0]?.athletes || [])
        .filter(a => a.starter)
        .map(a => ({
          id: a.athlete?.id,
          name: a.athlete?.shortName || a.athlete?.displayName || '',
          jersey: a.athlete?.jersey || '',
          pos: a.position || a.athlete?.position?.abbreviation || '',
          photo: a.athlete?.headshot?.href
            || (a.athlete?.id ? `https://a.espncdn.com/i/headshots/soccer/players/full/${a.athlete.id}.png` : null),
          formationPlace: a.formationPlace || 99,
          rating: a.rating != null ? Number(a.rating).toFixed(1) : null,
        }))
      if (side === 'home') result.home = players
      else result.away = players
    }
  }

  // Coaches
  for (const competitor of comp?.competitors || []) {
    const coaches = competitor.team?.coaches || []
    const hc = coaches.find(c => c.position?.name?.toLowerCase().includes('head')) || coaches[0]
    const name = hc?.athlete?.displayName || ''
    if (competitor.homeAway === 'home') result.homeCoach = name
    else result.awayCoach = name
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

// ── Match row ─────────────────────────────────────────────────
function MatchRow({ m, showDetails, espnInfo, statusMap, timelines }) {
  const ft = m.score?.ft
  const espnState = espnInfo?.state
  // Scores: prefer openfootball (source of truth), fall back to ESPN post-score
  const displayScore = ft || (espnState === 'post' ? espnInfo?.postScore : null)
  const [ds1, ds2] = displayScore || []
  const played = !!displayScore
  // Only live if ESPN says in-progress AND game isn't already complete
  const isLive = !played && espnState === 'in'
  const win1 = played && ds1 > ds2
  const win2 = played && ds2 > ds1
  const url1 = flagUrl(m.team1)
  const url2 = flagUrl(m.team2)
  const localTime = espnInfo ? fmtLocalTime(espnInfo.date) : null
  const venue = espnInfo?.venue
  const timeline = played && showDetails ? (timelines?.[espnInfo?.id] || []) : []
  const homeEvents = timeline.filter(e => e.side === 'home')
  const awayEvents = timeline.filter(e => e.side === 'away')

  return (
    <div className={`mx-row${played ? ' played' : ''}${isLive ? ' live' : ''}`}>
      <div className="mx-team-cell left">
        {url1 ? <img src={url1} alt={ab(m.team1)} className="mx-flag" onError={e => { e.target.style.display='none' }} /> : null}
        <span className={`mx-name${win1 ? ' win' : ''} st-${statusMap?.[m.team1] || 'tbd'}`}>{m.team1}</span>
        {homeEvents.length > 0 && (
          <div className="mx-row-events home">
            {homeEvents.map((e, i) => (
              <span key={i} className="mx-row-evt">{e.player && <>{e.player} </>}{eventIcon(e.type)} {e.min}</span>
            ))}
          </div>
        )}
      </div>
      <div className="mx-center">
        {isLive && <span className="mx-live-pip" />}
        {isLive && espnInfo?.clock && (
          <span className="mx-live-match-clock">{espnInfo.clock}</span>
        )}
        {played
          ? <span className="mx-score">{ds1}–{ds2}</span>
          : isLive && espnInfo?.liveScore
            ? <span className="mx-score mx-score-live">{espnInfo.liveScore[0]}–{espnInfo.liveScore[1]}</span>
            : <span className="mx-vs">vs</span>}
        {!isLive && showDetails && ((!played && localTime) || venue) && (
          <div className="mx-match-detail">
            {!played && localTime && <span className="mx-match-time">{localTime}</span>}
            {venue && <span className="mx-match-venue">{venue}</span>}
          </div>
        )}
      </div>
      <div className="mx-team-cell right">
        {awayEvents.length > 0 && (
          <div className="mx-row-events away">
            {awayEvents.map((e, i) => (
              <span key={i} className="mx-row-evt">{e.min} {eventIcon(e.type)}{e.player && <> {e.player}</>}</span>
            ))}
          </div>
        )}
        <span className={`mx-name${win2 ? ' win' : ''} st-${statusMap?.[m.team2] || 'tbd'}`}>{m.team2}</span>
        {url2 ? <img src={url2} alt={ab(m.team2)} className="mx-flag" onError={e => { e.target.style.display='none' }} /> : null}
      </div>
    </div>
  )
}

// ── Matchday block ────────────────────────────────────────────
function RoundBlock({ roundName, ms, highlight, showDetails, espnMap, statusMap, timelines }) {
  const played = ms.filter(m => m.score?.ft).length
  return (
    <div className={`mx-block${highlight ? ' current' : ''}`}>
      <div className="mx-block-hdr">
        <span className="mx-rnd-name">{roundName}</span>
        <span className="mx-rnd-progress">{played}/{ms.length}</span>
      </div>
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
const ROW_Y = [13, 37, 62, 85] // FWD, MID, DEF, GK (% from top)

function PitchPlayer({ player, x, y }) {
  const [imgFailed, setImgFailed] = useState(false)
  const jerseyName = player.name ? player.name.split(' ').slice(-1)[0] : player.jersey
  return (
    <div className="mx-pp" style={{ left:`${x}%`, top:`${y}%` }}>
      <div className="mx-pp-photo">
        {player.photo && !imgFailed
          ? <img src={player.photo} alt="" onError={() => setImgFailed(true)} className="mx-pp-img" />
          : <span className="mx-pp-num-badge">{player.jersey}</span>}
      </div>
      {player.rating && <span className="mx-pp-rating">{player.rating}</span>}
      <div className="mx-pp-label">
        <span className="mx-pp-num">{player.jersey}</span>
        <span className="mx-pp-name">{jerseyName}</span>
      </div>
    </div>
  )
}

function PitchView({ players }) {
  const rows = [[],[],[],[]]
  for (const p of players) rows[Math.min(posRow(p.pos), 3)].push(p)
  return (
    <div className="mx-pitch">
      <div className="mx-pline-half" />
      <div className="mx-pbox-top" />
      <div className="mx-pbox-bot" />
      {rows.map((row, ri) =>
        row.map((p, i) => {
          const n = row.length
          const x = n <= 1 ? 50 : 12 + (i / (n - 1)) * 76
          return <PitchPlayer key={p.id || `${ri}-${i}`} player={p} x={x} y={ROW_Y[ri]} />
        })
      )}
    </div>
  )
}

// ── Live match tile ───────────────────────────────────────────
function LiveMatchTile({ event, timeline, lineup }) {
  const [showAway, setShowAway] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setShowAway(s => !s), 12_000)
    return () => clearInterval(t)
  }, [])

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

  const squadPlayers = showAway ? (lineup?.away || []) : (lineup?.home || [])
  const squadCoach   = showAway ? (lineup?.awayCoach || '') : (lineup?.homeCoach || '')
  const squadFmtn    = showAway ? (lineup?.awayFormation || '') : (lineup?.homeFormation || '')
  const squadAbbr    = showAway ? awayAbbr : homeAbbr
  const squadFlag    = flagUrl(showAway ? awayName : homeName)

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

      {/* Match events strip */}
      {timeline.length > 0 && (
        <div className="mx-live-strip">
          {timeline.map((e, i) => (
            <span key={i} className="mx-live-strip-evt">
              {e.side === 'home' ? homeAbbr : awayAbbr} {eventIcon(e.type)}{e.player ? ` ${e.player.split(' ').pop()}` : ''} {e.min}'
            </span>
          ))}
        </div>
      )}

      {/* Squad cycling header */}
      <div className="mx-squad-hdr">
        <div className="mx-squad-team-id">
          {squadFlag && <img src={squadFlag} alt="" className="mx-sb-flag" onError={e=>{e.target.style.display='none'}} />}
          <span className="mx-squad-abbr">{squadAbbr}</span>
          {squadFmtn && <span className="mx-squad-fmtn">{squadFmtn}</span>}
        </div>
        <div className="mx-squad-dots">
          <button className={`mx-squad-dot${!showAway ? ' on' : ''}`} onClick={()=>setShowAway(false)} />
          <button className={`mx-squad-dot${showAway ? ' on' : ''}`} onClick={()=>setShowAway(true)} />
        </div>
      </div>

      {squadPlayers.length > 0
        ? <PitchView players={squadPlayers} />
        : <div className="mx-no-lineup">Lineup not yet available</div>}

      {squadCoach && <div className="mx-live-coach">Coach: {squadCoach}</div>}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────
function roundNum(r) {
  const m = r?.match(/\d+/)
  return m ? +m[0] : 999
}

export default function Matches({ matches, groups }) {
  const [espnMap, setEspnMap]         = useState({})
  const [liveEvents, setLiveEvents]   = useState([])
  const [timelines, setTimelines]     = useState({}) // eventId → parsed events[]
  const [lineups, setLineups]         = useState({}) // eventId → { home, away, coaches, formations }
  const fetchedCompletedIds           = useRef(new Set())

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(ESPN_SCOREBOARD)
        const d = await r.json()
        const events = d.events || []

        // Build lookup map for all events
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

        // Identify live matches
        const live = events.filter(e => e.status?.type?.state === 'in')
        setLiveEvents(live)

        const newTimelines = {}
        const newLineups   = {}

        // Fetch timelines + lineups for live matches (re-fetched every poll)
        await Promise.all(live.map(async ev => {
          try {
            const comp = ev.competitions?.[0]
            const homeComp = comp?.competitors?.find(c => c.homeAway === 'home')
            const awayComp = comp?.competitors?.find(c => c.homeAway === 'away')
            const r2 = await fetch(ESPN_SUMMARY(ev.id))
            const d2 = await r2.json()
            newTimelines[ev.id] = parseTimeline(d2, homeComp?.team?.id, awayComp?.team?.id)
            newLineups[ev.id]   = parseLineup(d2)
          } catch { newTimelines[ev.id] = [] }
        }))

        // Fetch timelines for newly completed matches (once only)
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

  const { rounds, activeIdx } = useMemo(() => {
    const byRound = {}
    for (const m of matches.filter(m => m.group)) {
      if (!byRound[m.round]) byRound[m.round] = []
      byRound[m.round].push(m)
    }
    const rounds = Object.entries(byRound).sort((a, b) => roundNum(a[0]) - roundNum(b[0]))
    let activeIdx = rounds.findIndex(([, ms]) => ms.some(m => !m.score?.ft))
    if (activeIdx < 0) activeIdx = rounds.length - 1
    return { rounds, activeIdx }
  }, [matches])

  const visible = useMemo(() => {
    const out = []
    for (const i of [activeIdx - 1, activeIdx, activeIdx + 1]) {
      if (i >= 0 && i < rounds.length) out.push({ round: rounds[i], idx: i })
    }
    return out
  }, [rounds, activeIdx])

  const statusMap = useMemo(() => buildTeamStatusMap(groups || {}), [groups])

  const hasLive = liveEvents.length > 0
  const liveCount = liveEvents.length
  const cols = liveCount <= 2 ? liveCount : liveCount <= 4 ? 2 : 3

  return (
    <div className="mx-outer">
      <div className={`mx-schedule-row${hasLive ? '' : ' no-live'}`}>
        {visible.map(({ round: [name, ms], idx }) => (
          <RoundBlock
            key={name}
            roundName={name}
            ms={ms}
            highlight={idx === activeIdx}
            showDetails={idx === activeIdx}
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
          </div>
          <div
            className="mx-live-tiles"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          >
            {liveEvents.map(ev => (
              <LiveMatchTile key={ev.id} event={ev} timeline={timelines[ev.id] || []} lineup={lineups[ev.id]} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
