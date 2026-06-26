import { useMemo, useState, useEffect, useRef } from 'react'
import { ab, flagUrl, buildResolver, teamStatus } from '../utils'

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

// Derive group letter from a match
function groupOf(m) { return m?.group?.replace(/^Group\s+/i, '').toUpperCase() || '' }

// Build winner/runner-up slot map from R32 match data
// openfootball uses codes: "1A" = Winner Group A, "2B" = Runner-up Group B
function buildGroupToSlot(byNum) {
  const winSlot = {}
  const rupSlot = {}
  for (const num of [...LEFT.r32, ...RIGHT.r32]) {
    const m = byNum[num]
    if (!m) continue
    for (const t of [m.team1, m.team2]) {
      if (!t) continue
      const w = t.match(/^1([A-L])$/i)
      const r = t.match(/^2([A-L])$/i)
      if (w) winSlot[w[1].toUpperCase()] = num
      if (r) rupSlot[r[1].toUpperCase()] = num
    }
  }
  return { winSlot, rupSlot }
}

// ── Compact group table (full stats) ─────────────────────────
function GroupTable({ letter, entries, spotlight = {} }) {
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
            const spot = spotlight[e.t] || ''
            const rowCls = [`sch-row-${status}`, spot && `sch-spot-${spot}`].filter(Boolean).join(' ')
            return (
              <tr key={e.t} className={rowCls}>
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

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T12:00:00')
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`
}

// ── Individual bracket match card ─────────────────────────────
function BkCard({ num, byNum, resolve, isToday = false, isPotential = false, isGreenSpot = false, isRedSpot = false, isElimSpot = false }) {
  const m = byNum[num]
  if (!m) {
    let cls = 'bk-slot empty'
    if (isPotential) cls += ' bk-potential'
    if (isGreenSpot) cls += ' bk-win-spot'
    else if (isElimSpot) cls += ' bk-elim-spot'
    else if (isRedSpot) cls += ' bk-lose-spot'
    return <div className={cls}><span className="bk-slot-num">M{num}</span></div>
  }

  const t1 = resolve(m.team1)
  const t2 = resolve(m.team2)
  const ft = m.score?.ft
  const [s1, s2] = ft || []
  const played = !!ft
  const win1 = played && s1 > s2
  const win2 = played && s2 > s1
  const dateStr = fmtDate(m.date)

  let cls = 'bk-slot'
  if (played) cls += ' played'
  if (isGreenSpot) cls += ' bk-win-spot'
  else if (isElimSpot) cls += ' bk-elim-spot'
  else if (isRedSpot) cls += ' bk-lose-spot'
  else if (isToday) cls += ' bk-today'
  else if (isPotential) cls += ' bk-potential'

  return (
    <div className={cls}>
      <div className="bk-snum-row">
        <span className="bk-snum">M{num}</span>
        {dateStr && <span className="bk-date">{dateStr}</span>}
      </div>
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

// Match num → the slot the winner advances to
const BRACKET_NEXT = {
  73:90, 75:90, 74:89, 77:89, 83:93, 84:93, 81:94, 82:94,
  76:91, 78:91, 79:92, 80:92, 86:95, 88:95, 85:96, 87:96,
  90:97, 89:97, 93:98, 94:98,
  91:99, 92:99, 95:100, 96:100,
  97:101, 98:101, 99:102, 100:102,
  101:104, 102:104,
}

// ── One side of the bracket (left or right) ───────────────────
function BracketHalf({ half, byNum, resolve, side, todayNums, potentialNums, greenSlots, redSlots, elimSlots }) {
  const r32Pairs = [[half.r32[0], half.r32[1]], [half.r32[2], half.r32[3]],
                    [half.r32[4], half.r32[5]], [half.r32[6], half.r32[7]]]
  const r16Pairs = [[half.r16[0], half.r16[1]], [half.r16[2], half.r16[3]]]

  const card = num => (
    <BkCard num={num} byNum={byNum} resolve={resolve}
      isToday={todayNums.has(num)} isPotential={potentialNums.has(num)}
      isGreenSpot={greenSlots.has(num)} isRedSpot={redSlots.has(num)} isElimSpot={elimSlots.has(num)} />
  )

  return (
    <div className={`bk-half ${side}`}>
      {/* R32 column */}
      <div className="bk-col bk-r32">
        {r32Pairs.map((pair, pi) => (
          <div key={pi} className="bk-pair">
            <div className="bk-cell top">{card(pair[0])}<div className="bk-conn-h" /></div>
            <div className="bk-cell bot">{card(pair[1])}<div className="bk-conn-h" /></div>
            <div className="bk-conn-v" />
          </div>
        ))}
      </div>

      {/* R16 column */}
      <div className="bk-col bk-r16">
        {r16Pairs.map((pair, pi) => (
          <div key={pi} className="bk-pair">
            <div className="bk-cell top">{card(pair[0])}<div className="bk-conn-h" /></div>
            <div className="bk-cell bot">{card(pair[1])}<div className="bk-conn-h" /></div>
            <div className="bk-conn-v" />
          </div>
        ))}
      </div>

      {/* QF column */}
      <div className="bk-col bk-qf">
        <div className="bk-pair">
          <div className="bk-cell top">{card(half.qf[0])}<div className="bk-conn-h" /></div>
          <div className="bk-cell bot">{card(half.qf[1])}<div className="bk-conn-h" /></div>
          <div className="bk-conn-v" />
        </div>
      </div>

      {/* SF column */}
      <div className="bk-col bk-sf">
        <div className="bk-cell sf-cell">
          {card(half.sf)}
          <div className="bk-conn-h bk-final-h" />
        </div>
      </div>
    </div>
  )
}

// ── Final match card (center) ─────────────────────────────────
function FinalCard({ byNum, resolve }) {
  const m = byNum[104]
  if (!m) return (
    <div className="bk-final-slot">
      <img src="/assets/wc-trophy2.png" alt="" className="bk-final-trophy" />
      <span className="bk-final-label">FINAL</span>
    </div>
  )

  const t1 = resolve(m.team1)
  const t2 = resolve(m.team2)
  const ft = m.score?.ft
  const [s1, s2] = ft || []
  const played = !!ft
  const win1 = played && s1 > s2
  const win2 = played && s2 > s1

  return (
    <div className="bk-final-slot">
      <img src="/assets/wc-trophy2.png" alt="" className="bk-final-trophy" />
      <span className="bk-final-label">FINAL</span>
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

const ROUND_DATES = [
  { round: 'R32', date: 'Jun 29–Jul 4'  },
  { round: 'R16', date: 'Jul 6–9'       },
  { round: 'QF',  date: 'Jul 11–12'     },
  { round: 'SF',  date: 'Jul 15–16'     },
]

const LEFT_GROUPS  = 'ABCDEF'.split('')
const RIGHT_GROUPS = 'GHIJKL'.split('')
const PHASE_MS = 6000 // 2 slow pulses × 3s each before switching

// ── Main export ───────────────────────────────────────────────
export default function Schedule({ groups, matches }) {
  const byNum = useMemo(() => {
    const m = {}
    for (const match of matches) if (match.num) m[match.num] = match
    return m
  }, [matches])
  const resolve = useMemo(() => buildResolver(groups, matches), [groups, matches])
  const slotMap = useMemo(() => buildGroupToSlot(byNum), [byNum])

  // Today's unplayed group matches split by bracket side
  const { spotlightPairs, pairCount } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const left = []
    const right = []
    for (const m of matches) {
      if (m.date !== today || !m.group || m.score?.ft) continue
      const g = groupOf(m)
      if (LEFT_GROUPS.includes(g)) left.push(m)
      else if (RIGHT_GROUPS.includes(g)) right.push(m)
    }
    const len = Math.max(left.length, right.length)
    const pairs = []
    for (let i = 0; i < len; i++) pairs.push({ left: left[i] || null, right: right[i] || null })
    return { spotlightPairs: pairs, pairCount: pairs.length }
  }, [matches])

  // Cycle: pairIdx × phase (0=team1 wins, 1=team2 wins)
  const [spot, setSpot] = useState({ pairIdx: 0, phase: 0 })
  const spotRef = useRef(spot)
  useEffect(() => { spotRef.current = spot }, [spot])

  useEffect(() => {
    if (!pairCount) return
    const t = setInterval(() => {
      setSpot(prev => prev.phase === 0
        ? { ...prev, phase: 1 }
        : { pairIdx: (prev.pairIdx + 1) % pairCount, phase: 0 })
    }, PHASE_MS)
    return () => clearInterval(t)
  }, [pairCount])

  // Compute what to highlight right now
  const spotlightInfo = useMemo(() => {
    if (!pairCount) return null
    const pair = spotlightPairs[spot.pairIdx]
    const { winSlot, rupSlot } = slotMap
    const spotlight = {}   // { [teamName]: 'green'|'red'|'elim' }
    const greenSlots = new Set()
    const redSlots   = new Set()
    const elimSlots  = new Set()

    for (const side of ['left', 'right']) {
      const m = pair?.[side]
      if (!m) continue
      const g = groupOf(m)
      const winner = spot.phase === 0 ? m.team1 : m.team2
      const loser  = spot.phase === 0 ? m.team2 : m.team1
      const loserEntry = (groups[g] || []).find(e => e.t === loser)
      const isElim = loserEntry && loserEntry.pts === 0 && loserEntry.p >= 2
      spotlight[winner] = 'green'
      spotlight[loser]  = isElim ? 'elim' : 'red'
      if (winSlot[g]) greenSlots.add(winSlot[g])
      if (rupSlot[g]) {
        if (isElim) elimSlots.add(rupSlot[g])
        else        redSlots.add(rupSlot[g])
      }
    }
    return { spotlight, greenSlots, redSlots, elimSlots }
  }, [spot, spotlightPairs, slotMap, groups, pairCount])

  // Today's knockout matches and potential next slots (pre-existing feature)
  const { todayNums, potentialNums } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const todayNums = new Set()
    const potentialNums = new Set()
    for (const m of matches) {
      if (m.num && m.date === today && !m.group) {
        todayNums.add(m.num)
        const next = BRACKET_NEXT[m.num]
        if (next) potentialNums.add(next)
      }
    }
    return { todayNums, potentialNums }
  }, [matches])

  const gs  = spotlightInfo?.greenSlots || new Set()
  const rs  = spotlightInfo?.redSlots   || new Set()
  const es  = spotlightInfo?.elimSlots  || new Set()
  const sp  = spotlightInfo?.spotlight  || {}

  return (
    <div className="sch-layout">
      {/* Groups A–F */}
      <div className="sch-groups-panel left">
        <div className="sch-panel-title">⚽ Groups A–F</div>
        <div className="sch-groups-col">
          {LEFT_GROUPS.map(g => (
            <GroupTable key={g} letter={g} entries={groups[g]} spotlight={sp} />
          ))}
        </div>
      </div>

      {/* Bracket tree */}
      <div className="sch-bracket">
        <div className="sch-bracket-labels">
          {ROUND_DATES.map(({ round, date }) => (
            <div key={round} className="bk-lbl">
              <span className="bk-lbl-round">{round}</span>
              <span className="bk-lbl-date">{date}</span>
            </div>
          ))}
          <div className="bk-lbl fin-lbl">
            <span className="bk-lbl-round">FINAL</span>
            <span className="bk-lbl-date">Jul 19</span>
          </div>
          {[...ROUND_DATES].reverse().map(({ round, date }) => (
            <div key={`r-${round}`} className="bk-lbl">
              <span className="bk-lbl-round">{round}</span>
              <span className="bk-lbl-date">{date}</span>
            </div>
          ))}
        </div>
        <div className="sch-bracket-body">
          <BracketHalf half={LEFT} byNum={byNum} resolve={resolve} side="left"
            todayNums={todayNums} potentialNums={potentialNums}
            greenSlots={gs} redSlots={rs} elimSlots={es} />
          <FinalCard byNum={byNum} resolve={resolve} />
          <BracketHalf half={RIGHT} byNum={byNum} resolve={resolve} side="right"
            todayNums={todayNums} potentialNums={potentialNums}
            greenSlots={gs} redSlots={rs} elimSlots={es} />
        </div>
      </div>

      {/* Groups G–L */}
      <div className="sch-groups-panel right">
        <div className="sch-panel-title">Groups G–L ⚽</div>
        <div className="sch-groups-col">
          {RIGHT_GROUPS.map(g => (
            <GroupTable key={g} letter={g} entries={groups[g]} spotlight={sp} />
          ))}
        </div>
      </div>
    </div>
  )
}
