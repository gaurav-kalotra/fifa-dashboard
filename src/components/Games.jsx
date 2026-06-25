import { ab, flagUrl } from '../utils'

const GROUP_ORDER = 'ABCDEFGHIJKL'.split('')

function Flag({ name, flip }) {
  const url = flagUrl(name)
  if (!url) return <span className="game-abbr-only">{ab(name)}</span>
  return (
    <img
      src={url}
      alt={ab(name)}
      className={`game-flag${flip ? ' flip' : ''}`}
      onError={(e) => { e.target.style.display = 'none' }}
    />
  )
}

export default function Games({ matches }) {
  const byGroup = {}
  for (const m of matches) {
    if (!m.group) continue
    if (!byGroup[m.group]) byGroup[m.group] = []
    byGroup[m.group].push(m)
  }

  function groupRound(group, roundName) {
    const rounds = [...new Set((byGroup[group] || []).map((m) => m.round))]
    const idx = rounds.indexOf(roundName)
    return idx >= 0 ? `MD${idx + 1}` : ''
  }

  return (
    <div className="games-grid">
      {GROUP_ORDER.map((g) => {
        const ms = byGroup[`Group ${g}`] || []
        if (!ms.length) return null
        return (
          <div key={g} className="games-group-card">
            <div className="games-group-title">Group {g}</div>
            <div className="games-matches">
              {ms.map((m, i) => {
                const ft = m.score?.ft
                const played = !!ft
                const [s1, s2] = ft || []
                const win1 = played && s1 > s2
                const win2 = played && s2 > s1
                const rd = groupRound(`Group ${g}`, m.round)
                return (
                  <div key={i} className={`game-row${played ? ' played' : ' upcoming'}`}>
                    <span className="game-md">{rd}</span>
                    <span className={`game-team${win1 ? ' gw' : ''}`}>
                      <Flag name={m.team1} />
                      <span className="game-abbr">{ab(m.team1)}</span>
                    </span>
                    <span className="game-score">{played ? `${s1}–${s2}` : 'vs'}</span>
                    <span className={`game-team right${win2 ? ' gw' : ''}`}>
                      <span className="game-abbr">{ab(m.team2)}</span>
                      <Flag name={m.team2} flip />
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
