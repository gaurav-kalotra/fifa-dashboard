import { useState, useEffect, useCallback } from 'react'

const toDateStr = (d) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

const fmtDisplay = (d) =>
  d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

const isToday = (d) => {
  const t = new Date()
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
}

const getLogo = (team) => team?.logos?.[0]?.href || team?.logo || null

function StatusBadge({ status }) {
  const state = status?.type?.state
  const detail = status?.type?.detail || ''
  if (state === 'in') return <span className="badge badge-live">LIVE {detail}</span>
  if (state === 'post') return <span className="badge badge-ft">FT</span>
  return null
}

function TeamRow({ team, score, showScore }) {
  const logo = getLogo(team)
  return (
    <div className="team-row">
      <div className="team-info">
        {logo ? (
          <img src={logo} alt={team?.abbreviation} className="team-flag" onError={(e) => { e.target.style.display = 'none' }} />
        ) : (
          <div className="team-abbr">{team?.abbreviation?.slice(0, 3)}</div>
        )}
        <span className="team-name">{team?.displayName || team?.name || team?.abbreviation}</span>
      </div>
      {showScore && <span className="team-score">{score ?? '0'}</span>}
    </div>
  )
}

function MatchCard({ event }) {
  const comp = event.competitions?.[0]
  if (!comp) return null

  const home = comp.competitors?.find((c) => c.homeAway === 'home')
  const away = comp.competitors?.find((c) => c.homeAway === 'away') ?? comp.competitors?.[1]
  const status = comp.status
  const state = status?.type?.state
  const group = comp.groups?.name || comp.groups?.shortName || ''
  const venue = comp.venue?.fullName || ''
  const city = comp.venue?.address?.city || ''
  const kickoff = new Date(event.date)
  const timeStr = kickoff.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  const showScore = state === 'in' || state === 'post'

  return (
    <div className={`match-card${state === 'in' ? ' live' : ''}`}>
      <div className="match-meta">
        <span className="match-group">{group}</span>
        {showScore ? <StatusBadge status={status} /> : <span className="match-kickoff">{timeStr}</span>}
      </div>
      <div className="match-teams">
        <TeamRow team={home?.team} score={home?.score} showScore={showScore} />
        <TeamRow team={away?.team} score={away?.score} showScore={showScore} />
      </div>
      {(venue || city) && (
        <div className="match-venue">
          {[venue, city].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  )
}

export default function Scores() {
  const [date, setDate] = useState(new Date())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchScores = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch(
        `/espn/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${toDateStr(date)}&limit=50`
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setEvents(data.events || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    setLoading(true)
    fetchScores()
    const interval = setInterval(fetchScores, 60_000)
    return () => clearInterval(interval)
  }, [fetchScores])

  const shift = (days) =>
    setDate((d) => {
      const nd = new Date(d)
      nd.setDate(nd.getDate() + days)
      return nd
    })

  return (
    <div>
      <div className="date-nav">
        <button className="date-arrow" onClick={() => shift(-1)}>‹</button>
        <div className="date-center">
          <span className="date-label">{isToday(date) ? 'Today' : fmtDisplay(date)}</span>
          {!isToday(date) && (
            <button className="today-btn" onClick={() => setDate(new Date())}>Today</button>
          )}
        </div>
        <button className="date-arrow" onClick={() => shift(1)}>›</button>
      </div>

      {loading && (
        <div className="loading">
          <div className="spinner" />
          Loading matches…
        </div>
      )}

      {error && !loading && (
        <div className="error">Failed to load — {error}</div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="empty">No matches on this date.</div>
      )}

      {!loading && events.length > 0 && (
        <div className="match-grid">
          {events.map((event) => (
            <MatchCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
