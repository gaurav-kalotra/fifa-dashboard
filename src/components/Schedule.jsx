import { useMemo } from 'react'
import { ab, flagUrl, buildResolver } from '../utils'

// ── Bracket structure for WC2026 ──────────────────────────────
// Left half → SF M101 → Final M104
const LEFT = {
  sf: 101,
  qf: [97, 98],
  r16: [90, 89, 93, 94], // grouped: [90,89]→97, [93,94]→98
  r32: [73, 75, 74, 77, 83, 84, 81, 82], // grouped: pairs feed into r16 order
}
// Right half → SF M102 → Final M104
const RIGHT = {
  sf: 102,
  qf: [99, 100],
  r16: [91, 92, 95, 96],
  r32: [76, 78, 79, 80, 86, 88, 85, 87],
}

// ── Small flag helper ─────────────────────────────────────────
function Flag({ name, cls = 'sch-flag' }) {
  const url = name ? flagUrl(name) : null
  return url
    ? <img src={url} alt={ab(name)} className={cls} onError={e => { e.target.style.display = 'none' }} />
    : null
}

function teamStatus(entries, i) {
  const e = entries[i]
  const groupDone = entries.every(x => x.p === 3)
  if (groupDone) {
    if (i <= 1) return 'qual'
    if (i === 2) return 'tbd'   // WC2026: best 3rd-place teams also advance
    return 'elim'
  }
  const maxPts = e.pts + (3 - e.p) * 3
  const second = entries[1]
  if (i >= 2 && maxPts < (second?.pts ?? 0)) return 'elim'
  if (i <= 1) {
    const third = entries[2]
    const thirdMax = (third?.pts ?? 0) + (3 - (third?.p ?? 0)) * 3
    if (thirdMax < e.pts) return 'qual'
  }
  return 'tbd'
}

// ── Compact group table (full stats) ─────────────────────────
function GroupTable({ letter, entries }) {
  if (!entries?.length) return null
  return (
    <div className="sch-group">
      <div className="sch-group-hdr">Group {letter}</div>
      <table className="sch-tbl">
        <thead>
          <tr>
            <th className="sch-th-team" />
            <th>P</th><th>W</th><th>D</th><th>L</th>
            <th>GF</th><th>GA</th><th>GD</th><th className="sch-th-pts">Pts</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => {
            const status = teamStatus(entries, i)
            return (
              <tr key={e.t} className={`sch-row-${status}`}>
                <td className="sch-td-team">
                  <Flag name={e.t} cls="sch-flag-xs" />
                  <span>{ab(e.t)}</span>
                </td>
                <td>{e.p}</td><td>{e.w}</td><td>{e.d}</td><td>{e.l}</td>
                <td>{e.gf}</td><td>{e.ga}</td>
                <td className={e.gf - e.ga > 0 ? 'pos' : e.gf - e.ga < 0 ? 'neg' : ''}>
                  {e.gf - e.ga > 0 ? `+${e.gf - e.ga}` : e.gf - e.ga}
                </td>
                <td className="sch-td-pts">{e.pts}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Individual bracket match card ─────────────────────────────
function BkCard({ num, byNum, resolve, side = 'left' }) {
  const m = byNum[num]
  if (!m) return <div className="bk-slot empty"><span className="bk-slot-num">M{num}</span></div>

  const t1 = resolve(m.team1)
  const t2 = resolve(m.team2)
  const ft = m.score?.ft
  const [s1, s2] = ft || []
  const played = !!ft
  const win1 = played && s1 > s2
  const win2 = played && s2 > s1

  return (
    <div className={`bk-slot${played ? ' played' : ''}`}>
      <span className="bk-snum">M{num}</span>
      <div className={`bk-row${win1 ? ' win' : ''}`}>
        <Flag name={t1} cls="bk-flag" />
        <span className="bk-name">{t1 ? ab(t1) : m.team1}</span>
        {played && <span className="bk-s">{s1}</span>}
      </div>
      <div className={`bk-row${win2 ? ' win' : ''}`}>
        <Flag name={t2} cls="bk-flag" />
        <span className="bk-name">{t2 ? ab(t2) : m.team2}</span>
        {played && <span className="bk-s">{s2}</span>}
      </div>
    </div>
  )
}

// ── One side of the bracket (left or right) ───────────────────
function BracketHalf({ half, byNum, resolve, side }) {
  const flip = side === 'right'
  // R32 → R16: pairs: [r32[0],r32[1]]→r16[0], [r32[2],r32[3]]→r16[1], ...
  const r32Pairs = [[half.r32[0], half.r32[1]], [half.r32[2], half.r32[3]],
                    [half.r32[4], half.r32[5]], [half.r32[6], half.r32[7]]]
  const r16Pairs = [[half.r16[0], half.r16[1]], [half.r16[2], half.r16[3]]]

  const colOrder = [
    { key: 'r32', items: half.r32, pairSize: 2 },
    { key: 'r16', items: half.r16, pairSize: 2 },
    { key: 'qf', items: half.qf, pairSize: 2 },
    { key: 'sf', items: [half.sf], pairSize: null },
  ]
  if (flip) colOrder.reverse()

  return (
    <div className={`bk-half ${side}`}>
      {/* R32 column */}
      <div className="bk-col bk-r32">
        {r32Pairs.map((pair, pi) => (
          <div key={pi} className="bk-pair">
            <div className="bk-cell top">
              <BkCard num={pair[0]} byNum={byNum} resolve={resolve} side={side} />
              <div className="bk-conn-h" />
            </div>
            <div className="bk-cell bot">
              <BkCard num={pair[1]} byNum={byNum} resolve={resolve} side={side} />
              <div className="bk-conn-h" />
            </div>
            <div className="bk-conn-v" />
          </div>
        ))}
      </div>

      {/* R16 column */}
      <div className="bk-col bk-r16">
        {r16Pairs.map((pair, pi) => (
          <div key={pi} className="bk-pair">
            <div className="bk-cell top">
              <BkCard num={pair[0]} byNum={byNum} resolve={resolve} side={side} />
              <div className="bk-conn-h" />
            </div>
            <div className="bk-cell bot">
              <BkCard num={pair[1]} byNum={byNum} resolve={resolve} side={side} />
              <div className="bk-conn-h" />
            </div>
            <div className="bk-conn-v" />
          </div>
        ))}
      </div>

      {/* QF column */}
      <div className="bk-col bk-qf">
        <div className="bk-pair">
          <div className="bk-cell top">
            <BkCard num={half.qf[0]} byNum={byNum} resolve={resolve} side={side} />
            <div className="bk-conn-h" />
          </div>
          <div className="bk-cell bot">
            <BkCard num={half.qf[1]} byNum={byNum} resolve={resolve} side={side} />
            <div className="bk-conn-h" />
          </div>
          <div className="bk-conn-v" />
        </div>
      </div>

      {/* SF column */}
      <div className="bk-col bk-sf">
        <div className="bk-cell sf-cell">
          <BkCard num={half.sf} byNum={byNum} resolve={resolve} side={side} />
          <div className="bk-conn-h final-h" />
        </div>
      </div>
    </div>
  )
}

// ── Final match card (center) ─────────────────────────────────
function FinalCard({ byNum, resolve }) {
  const m = byNum[104]
  if (!m) return <div className="bk-final-slot"><span className="bk-final-label">FINAL</span></div>

  const t1 = resolve(m.team1)
  const t2 = resolve(m.team2)
  const ft = m.score?.ft
  const [s1, s2] = ft || []
  const played = !!ft
  const win1 = played && s1 > s2
  const win2 = played && s2 > s1

  return (
    <div className="bk-final-slot">
      <span className="bk-final-label">🏆 FINAL</span>
      <div className={`bk-final-row${win1 ? ' win' : ''}`}>
        <Flag name={t1} cls="bk-flag-lg" />
        <span>{t1 ? ab(t1) : (m.team1 || '?')}</span>
        {played && <span className="bk-final-s">{s1}</span>}
      </div>
      <div className="bk-final-vs">{played ? '—' : 'vs'}</div>
      <div className={`bk-final-row${win2 ? ' win' : ''}`}>
        <Flag name={t2} cls="bk-flag-lg" />
        <span>{t2 ? ab(t2) : (m.team2 || '?')}</span>
        {played && <span className="bk-final-s">{s2}</span>}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────
export default function Schedule({ groups, matches }) {
  const byNum = useMemo(() => {
    const m = {}
    for (const match of matches) if (match.num) m[match.num] = match
    return m
  }, [matches])
  const resolve = useMemo(() => buildResolver(groups, matches), [groups, matches])

  const leftGroups = 'ABCDEF'.split('')
  const rightGroups = 'GHIJKL'.split('')

  return (
    <div className="sch-layout">
      {/* Groups A–F */}
      <div className="sch-groups-panel left">
        <div className="sch-panel-title">⚽ Groups A–F</div>
        <div className="sch-groups-col">
          {leftGroups.map(g => <GroupTable key={g} letter={g} entries={groups[g]} />)}
        </div>
      </div>

      {/* Bracket tree */}
      <div className="sch-bracket">
        <div className="sch-bracket-labels">
          <span>R32</span><span>R16</span><span>QF</span><span>SF</span>
          <span className="fin-lbl">FINAL</span>
          <span>SF</span><span>QF</span><span>R16</span><span>R32</span>
        </div>
        <div className="sch-bracket-body">
          <BracketHalf half={LEFT} byNum={byNum} resolve={resolve} side="left" />
          <FinalCard byNum={byNum} resolve={resolve} />
          <BracketHalf half={RIGHT} byNum={byNum} resolve={resolve} side="right" />
        </div>
      </div>

      {/* Groups G–L */}
      <div className="sch-groups-panel right">
        <div className="sch-panel-title">Groups G–L ⚽</div>
        <div className="sch-groups-col">
          {rightGroups.map(g => <GroupTable key={g} letter={g} entries={groups[g]} />)}
        </div>
      </div>
    </div>
  )
}
