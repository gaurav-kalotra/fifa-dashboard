import { useMemo } from 'react'
import { ab } from '../utils'

export default function Ticker({ matches }) {
  const items = useMemo(() => {
    const results = matches
      .filter(m => m.score?.ft)
      .map(m => {
        const [s1, s2] = m.score.ft
        const ctx = m.group
          ? m.group.replace('Group ', 'GRP ')
          : (m.round || '').replace('Round of ', 'R').replace('Quarter-final', 'QF').replace('Semi-final', 'SF')
        return { label: ctx, text: `${ab(m.team1)} ${s1}–${s2} ${ab(m.team2)}`, type: 'result' }
      })
    const upcoming = matches
      .filter(m => !m.score?.ft && m.group)
      .slice(0, 8)
      .map(m => ({
        label: m.group.replace('Group ', 'GRP '),
        text: `${ab(m.team1)} vs ${ab(m.team2)}`,
        type: 'upcoming'
      }))
    return [...results, ...upcoming]
  }, [matches])

  if (!items.length) return null
  const doubled = [...items, ...items]

  return (
    <div className="ticker">
      <div className="ticker-badge">
        <span className="ticker-icon">⚽</span>
        <span>WC 2026</span>
      </div>
      <div className="ticker-track">
        <div className="ticker-scroll">
          {doubled.map((item, i) => (
            <span key={i} className={`ticker-item${item.type === 'upcoming' ? ' dim' : ''}`}>
              <span className="ticker-ctx">{item.label}</span>
              {item.text}
              <span className="ticker-sep">◆</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
