const GROUP_ORDER = 'ABCDEFGHIJKL'.split('')

export default function Standings({ groups }) {
  const hasData = Object.keys(groups).length > 0

  if (!hasData) return <div className="empty">No standings data yet.</div>

  return (
    <div>
      <div className="legend">
        <span className="legend-dot" /> Advance to Round of 32
      </div>
      <div className="groups-grid">
        {GROUP_ORDER.map((g) => {
          const entries = groups[g]
          if (!entries?.length) return null
          return (
            <div key={g} className="group-card">
              <div className="group-header">Group {g}</div>
              <table className="standings-table">
                <thead>
                  <tr>
                    <th className="col-pos">#</th>
                    <th className="col-team-cell">Team</th>
                    <th>P</th>
                    <th>W</th>
                    <th>D</th>
                    <th>L</th>
                    <th>GF</th>
                    <th>GA</th>
                    <th>GD</th>
                    <th className="col-pts">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={e.t} className={i < 2 ? 'row-qualify' : ''}>
                      <td className="col-pos">{i + 1}</td>
                      <td className="col-team-cell">
                        <div className="col-team-inner">
                          <span className="tbl-name">{e.t}</span>
                        </div>
                      </td>
                      <td>{e.p}</td>
                      <td>{e.w}</td>
                      <td>{e.d}</td>
                      <td>{e.l}</td>
                      <td>{e.gf}</td>
                      <td>{e.ga}</td>
                      <td>{e.gf - e.ga > 0 ? `+${e.gf - e.ga}` : e.gf - e.ga}</td>
                      <td className="col-pts"><strong>{e.pts}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}
