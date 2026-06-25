import { useMemo } from 'react'
import { ab, flagUrl } from '../utils'

function roundNum(r) {
  const m = r?.match(/\d+/)
  return m ? +m[0] : 999
}

function MatchRow({ m, liveNums }) {
  const ft = m.score?.ft
  const [s1, s2] = ft || []
  const played = !!ft
  const win1 = played && s1 > s2
  const win2 = played && s2 > s1
  const url1 = flagUrl(m.team1)
  const url2 = flagUrl(m.team2)
  const isLive = liveNums.has(m.num ?? `${m.team1}-${m.team2}`)

  return (
    <div className={`mx-row${played ? ' played' : ''}${isLive ? ' live' : ''}`}>
      {url1 ? <img src={url1} alt={ab(m.team1)} className="mx-flag" onError={e => e.target.style.display='none'} />
             : <span className="mx-abbr-only">{ab(m.team1)}</span>}
      <span className={`mx-team left${win1 ? ' win' : ''}`}>{ab(m.team1)}</span>
      <span className="mx-score-cell">
        {isLive && <span className="mx-live-dot" />}
        {played
          ? <span className="mx-score">{s1}–{s2}</span>
          : <span className="mx-vs">vs</span>}
      </span>
      <span className={`mx-team right${win2 ? ' win' : ''}`}>{ab(m.team2)}</span>
      {url2 ? <img src={url2} alt={ab(m.team2)} className="mx-flag right" onError={e => e.target.style.display='none'} />
             : <span className="mx-abbr-only">{ab(m.team2)}</span>}
      {played && (
        <span className={`mx-result${win1 ? ' w1' : win2 ? ' w2' : ' draw'}`}>
          {win1 ? 'W' : win2 ? 'W' : 'D'}
        </span>
      )}
    </div>
  )
}

export default function Matches({ matches }) {
  const { currentRounds, upcomingRounds, recentRounds } = useMemo(() => {
    const groupMatches = matches.filter(m => m.group)
    const byRound = {}
    for (const m of groupMatches) {
      if (!byRound[m.round]) byRound[m.round] = []
      byRound[m.round].push(m)
    }

    const rounds = Object.entries(byRound)
      .sort((a, b) => roundNum(a[0]) - roundNum(b[0]))

    // Find the boundary: first round with any unplayed match
    let activeIdx = rounds.findIndex(([, ms]) => ms.some(m => !m.score?.ft))
    if (activeIdx < 0) activeIdx = rounds.length - 1

    // currentRounds: one round before + active round (partially played or upcoming)
    const currentRounds = rounds.slice(Math.max(0, activeIdx - 1), activeIdx + 1)
    const upcomingRounds = rounds.slice(activeIdx + 1, activeIdx + 3)
    const recentRounds = activeIdx > 1 ? rounds.slice(Math.max(0, activeIdx - 3), activeIdx - 1) : []

    return { currentRounds, upcomingRounds, recentRounds }
  }, [matches])

  // For live detection: mark matches in the most recent partial round as potentially live
  const liveNums = useMemo(() => {
    const s = new Set()
    if (currentRounds.length > 0) {
      const latest = currentRounds[currentRounds.length - 1][1]
      const hasAnyResult = latest.some(m => m.score?.ft)
      const hasAnyUpcoming = latest.some(m => !m.score?.ft)
      if (hasAnyResult && hasAnyUpcoming) {
        // Partially played round: unplayed matches may be live
        for (const m of latest) {
          if (!m.score?.ft) s.add(m.num ?? `${m.team1}-${m.team2}`)
        }
      }
    }
    return s
  }, [currentRounds])

  function RoundSection({ label, rounds, dim }) {
    if (!rounds.length) return null
    return (
      <div className={`mx-section${dim ? ' dim' : ''}`}>
        <div className="mx-section-label">{label}</div>
        <div className="mx-rounds-grid">
          {rounds.map(([roundName, ms]) => (
            <div key={roundName} className="mx-round-block">
              <div className="mx-round-header">{roundName}</div>
              {ms.map((m, i) => <MatchRow key={i} m={m} liveNums={liveNums} />)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-layout">
      <RoundSection label="● CURRENT" rounds={currentRounds} />
      <RoundSection label="UPCOMING" rounds={upcomingRounds} />
      <RoundSection label="RECENT" rounds={recentRounds} dim />
    </div>
  )
}
