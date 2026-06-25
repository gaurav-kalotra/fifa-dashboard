import { useMemo, useState, useEffect } from 'react'
import { ab, flagUrl } from '../utils'

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'
const ESPN_SUMMARY = id => `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${id}`

function normalTeam(n = '') {
  return n.toLowerCase()
    .replace(/united states/i, 'usa')
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

function parseTimeline(summary) {
  const items = summary?.plays || summary?.keyEvents || []
  const out = []
  for (const p of items) {
    const typeRaw = (p.type?.id || p.type?.text || '').toLowerCase()
    if (!typeRaw.includes('goal') && !typeRaw.includes('card') && !typeRaw.includes('pen')) continue
    const minRaw = p.clock?.value ?? p.clock?.displayValue ?? ''
    const player = p.participants?.find(x =>
      x.type?.id === 'scorer' || !x.type?.id
    )?.athlete?.displayName || p.athlete?.displayName || ''
    out.push({
      min: typeof minRaw === 'number' ? Math.floor(minRaw) : parseInt(minRaw) || minRaw,
      type: typeRaw,
      player,
      team: p.team?.abbreviation || '',
    })
  }
  return out.sort((a, b) => (parseInt(a.min) || 0) - (parseInt(b.min) || 0))
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
function MatchRow({ m, isLive, showDetails, espnInfo }) {
  const ft = m.score?.ft
  const [s1, s2] = ft || []
  const played = !!ft
  const win1 = played && s1 > s2
  const win2 = played && s2 > s1
  const url1 = flagUrl(m.team1)
  const url2 = flagUrl(m.team2)
  const localTime = espnInfo ? fmtLocalTime(espnInfo.date) : null
  const venue = espnInfo?.venue

  return (
    <div className={`mx-row${played ? ' played' : ''}${isLive ? ' live' : ''}`}>
      <div className="mx-team-cell left">
        {url1 ? <img src={url1} alt={ab(m.team1)} className="mx-flag" onError={e => { e.target.style.display='none' }} /> : null}
        <span className={`mx-name${win1 ? ' win' : ''}`}>{ab(m.team1)}</span>
      </div>
      <div className="mx-center">
        {isLive && <span className="mx-live-pip" />}
        {played
          ? <span className="mx-score">{s1}–{s2}</span>
          : <span className="mx-vs">vs</span>}
        {showDetails && (localTime || venue) && (
          <div className="mx-match-detail">
            {localTime && <span className="mx-match-time">{localTime}</span>}
            {venue && <span className="mx-match-venue">{venue}</span>}
          </div>
        )}
      </div>
      <div className="mx-team-cell right">
        <span className={`mx-name${win2 ? ' win' : ''}`}>{ab(m.team2)}</span>
        {url2 ? <img src={url2} alt={ab(m.team2)} className="mx-flag" onError={e => { e.target.style.display='none' }} /> : null}
      </div>
    </div>
  )
}

// ── Matchday block ────────────────────────────────────────────
function RoundBlock({ roundName, ms, liveNums, highlight, showDetails, espnMap }) {
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
            isLive={liveNums.has(m.num ?? `${m.team1}-${m.team2}`)}
            showDetails={showDetails}
            espnInfo={espnMap?.[teamsKey(m.team1, m.team2)]}
          />
        ))}
      </div>
    </div>
  )
}

// ── Live match tile ───────────────────────────────────────────
function LiveMatchTile({ event, timeline }) {
  const comp = event.competitions?.[0]
  const home = comp?.competitors?.find(c => c.homeAway === 'home')
  const away = comp?.competitors?.find(c => c.homeAway === 'away')
  const clock = event.status?.displayClock || event.status?.type?.shortDetail || '?'
  const homeScore = parseInt(home?.score ?? '0')
  const awayScore = parseInt(away?.score ?? '0')
  const homeAbbr = home?.team?.abbreviation || home?.team?.shortDisplayName || '?'
  const awayAbbr = away?.team?.abbreviation || away?.team?.shortDisplayName || '?'
  const homeName = home?.team?.displayName || homeAbbr
  const awayName = away?.team?.displayName || awayAbbr
  const venue = comp?.venue?.shortName || comp?.venue?.fullName || ''

  return (
    <div className="mx-live-tile">
      <div className="mx-live-hdr">
        <span className="mx-live-badge"><span className="mx-live-dot" />LIVE</span>
        <span className="mx-live-group">{event.shortName || ''}</span>
        <span className="mx-live-clock">{clock}</span>
        {venue && <span className="mx-live-venue">{venue}</span>}
      </div>

      <div className="mx-live-score-row">
        <div className="mx-live-team">
          <img src={flagUrl(homeName)} alt={homeAbbr} className="mx-live-flag"
            onError={e => { e.target.style.display='none' }} />
          <span className="mx-live-team-name">{homeAbbr}</span>
        </div>
        <div className="mx-live-goals">
          <span className={`mx-live-num${homeScore > awayScore ? ' lead' : ''}`}>{homeScore}</span>
          <span className="mx-live-dash">—</span>
          <span className={`mx-live-num${awayScore > homeScore ? ' lead' : ''}`}>{awayScore}</span>
        </div>
        <div className="mx-live-team right">
          <span className="mx-live-team-name">{awayAbbr}</span>
          <img src={flagUrl(awayName)} alt={awayAbbr} className="mx-live-flag"
            onError={e => { e.target.style.display='none' }} />
        </div>
      </div>

      <div className="mx-live-timeline">
        {timeline.length === 0
          ? <span className="mx-live-no-events">Waiting for events…</span>
          : timeline.map((evt, i) => (
            <div key={i} className={`mx-live-event ${evt.type.includes('yellow') ? 'yellow' : evt.type.includes('red') ? 'red' : 'goal'}`}>
              <span className="mx-live-evt-min">{evt.min}'</span>
              <span className="mx-live-evt-icon">{eventIcon(evt.type)}</span>
              <span className="mx-live-evt-player">{evt.player || '—'}</span>
              {evt.team && <span className="mx-live-evt-team">{evt.team}</span>}
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────
function roundNum(r) {
  const m = r?.match(/\d+/)
  return m ? +m[0] : 999
}

export default function Matches({ matches }) {
  const [espnMap, setEspnMap]         = useState({}) // teamsKey → { date, venue, id, state, clock, score }
  const [liveEvents, setLiveEvents]   = useState([]) // raw ESPN event objects (state === 'in')
  const [timelines, setTimelines]     = useState({}) // eventId → parsed events[]

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
          map[key] = {
            id: ev.id,
            date: ev.date,
            venue: comp.venue?.shortName || comp.venue?.fullName || '',
            state: ev.status?.type?.state,
            clock: ev.status?.displayClock,
          }
        }
        setEspnMap(map)

        // Identify live matches
        const live = events.filter(e => e.status?.type?.state === 'in')
        setLiveEvents(live)

        // Fetch timelines for live matches
        if (live.length) {
          const newTimelines = {}
          await Promise.all(live.map(async ev => {
            try {
              const r2 = await fetch(ESPN_SUMMARY(ev.id))
              const d2 = await r2.json()
              newTimelines[ev.id] = parseTimeline(d2)
            } catch { newTimelines[ev.id] = [] }
          }))
          setTimelines(newTimelines)
        } else {
          setTimelines({})
        }
      } catch {}
    }

    load()
    const iv = setInterval(load, 60_000)
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

  const liveNums = useMemo(() => {
    const s = new Set()
    const [, ms] = rounds[activeIdx] || [, []]
    if (ms.some(m => m.score?.ft) && ms.some(m => !m.score?.ft)) {
      for (const m of ms) if (!m.score?.ft) s.add(m.num ?? `${m.team1}-${m.team2}`)
    }
    return s
  }, [rounds, activeIdx])

  const visible = useMemo(() => {
    const out = []
    for (const i of [activeIdx - 1, activeIdx, activeIdx + 1]) {
      if (i >= 0 && i < rounds.length) out.push({ round: rounds[i], idx: i })
    }
    return out
  }, [rounds, activeIdx])

  const hasLive = liveEvents.length > 0

  return (
    <div className="mx-outer">
      <div className={`mx-schedule-row${hasLive ? ' has-live' : ''}`}>
        {visible.map(({ round: [name, ms], idx }) => (
          <RoundBlock
            key={name}
            roundName={name}
            ms={ms}
            liveNums={liveNums}
            highlight={idx === activeIdx}
            showDetails={idx === activeIdx}
            espnMap={espnMap}
          />
        ))}
      </div>

      {hasLive && (
        <div className="mx-live-section">
          <div className="mx-live-section-label">
            <span className="mx-live-dot" />
            LIVE NOW
          </div>
          <div className="mx-live-tiles">
            {liveEvents.map(ev => (
              <LiveMatchTile key={ev.id} event={ev} timeline={timelines[ev.id] || []} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
