import { useMemo } from 'react'
import { ab, flagUrl } from '../utils'

function roundNum(r) {
  const m = r?.match(/\d+/)
  return m ? +m[0] : 999
}

function MatchRow({ m, isLive }) {
  const ft = m.score?.ft
  const [s1, s2] = ft || []
  const played = !!ft
  const win1 = played && s1 > s2
  const win2 = played && s2 > s1
  const url1 = flagUrl(m.team1)
  const url2 = flagUrl(m.team2)

  return (
    <div className={`mx-row${played ? ' played' : ''}${isLive ? ' live' : ''}`}>
      <div className="mx-team-cell left">
        {url1
          ? <img src={url1} alt={ab(m.team1)} className="mx-flag" onError={e => { e.target.style.display = 'none' }} />
          : null}
        <span className={`mx-name${win1 ? ' win' : ''}`}>{ab(m.team1)}</span>
      </div>

      <div className="mx-center">
        {isLive && <span className="mx-live-pip" />}
        {played
          ? <span className="mx-score">{s1}–{s2}</span>
          : <span className="mx-vs">vs</span>}
      </div>

      <div className="mx-team-cell right">
        <span className={`mx-name${win2 ? ' win' : ''}`}>{ab(m.team2)}</span>
        {url2
          ? <img src={url2} alt={ab(m.team2)} className="mx-flag" onError={e => { e.target.style.display = 'none' }} />
          : null}
      </div>
    </div>
  )
}

function RoundBlock({ roundName, ms, liveNums, highlight }) {
  const played = ms.filter(m => m.score?.ft).length
  const total = ms.length
  return (
    <div className={`mx-block${highlight ? ' current' : ''}`}>
      <div className="mx-block-hdr">
        <span className="mx-rnd-name">{roundName}</span>
        <span className="mx-rnd-progress">{played}/{total}</span>
      </div>
      <div className="mx-block-matches">
        {ms.map((m, i) => (
          <MatchRow key={i} m={m} isLive={liveNums.has(m.num ?? `${m.team1}-${m.team2}`)} />
        ))}
      </div>
    </div>
  )
}

export default function Matches({ matches }) {
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

  // Mark potentially live: unplayed matches in a partially-played active round
  const liveNums = useMemo(() => {
    const s = new Set()
    const [, ms] = rounds[activeIdx] || [, []]
    if (ms.some(m => m.score?.ft) && ms.some(m => !m.score?.ft)) {
      for (const m of ms) if (!m.score?.ft) s.add(m.num ?? `${m.team1}-${m.team2}`)
    }
    return s
  }, [rounds, activeIdx])

  // Show 3 blocks: previous (dimmed), current (highlighted), next upcoming
  const visible = useMemo(() => {
    const out = []
    const slots = [activeIdx - 1, activeIdx, activeIdx + 1]
    for (const i of slots) {
      if (i >= 0 && i < rounds.length) {
        out.push({ round: rounds[i], idx: i })
      }
    }
    return out
  }, [rounds, activeIdx])

  return (
    <div className="mx-outer">
      <div className="mx-inner">
        {visible.map(({ round: [name, ms], idx, dim }) => (
          <RoundBlock
            key={name}
            roundName={name}
            ms={ms}
            liveNums={liveNums}
            highlight={idx === activeIdx}
          />
        ))}
      </div>
    </div>
  )
}
