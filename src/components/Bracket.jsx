import { useMemo, useState } from 'react'
import { ab, flagUrl, buildResolver } from '../utils'

const ROUNDS = [
  { key: 'Round of 32', label: 'R32' },
  { key: 'Round of 16', label: 'R16' },
  { key: 'Quarter-final', label: 'QF' },
  { key: 'Semi-final', label: 'SF' },
  { key: 'Final', label: 'Final' },
]

function TeamSlot({ code, real, score, isWinner, isPlayed }) {
  const url = real ? flagUrl(real) : null
  return (
    <div className={`bk-team${isWinner ? ' bk-winner' : ''}${!real && !isPlayed ? ' bk-tbd' : ''}`}>
      {url ? (
        <img src={url} alt={ab(real)} className="bk-flag"
          onError={(e) => { e.target.style.display = 'none' }} />
      ) : (
        <span className="bk-abbr">{real ? ab(real) : '—'}</span>
      )}
      <span className="bk-name">{real ? ab(real) : code}</span>
      {score != null && <span className="bk-score">{score}</span>}
    </div>
  )
}

function BracketMatch({ match, resolve }) {
  const t1 = resolve(match.team1)
  const t2 = resolve(match.team2)
  const ft = match.score?.ft
  const [s1, s2] = ft || []
  const win1 = ft && s1 > s2
  const win2 = ft && s2 > s1
  const isPlayed = !!ft

  return (
    <div className={`bk-match${isPlayed ? ' bk-played' : ''}`}>
      {match.num && <div className="bk-num">Match {match.num}</div>}
      <TeamSlot code={match.team1} real={t1} score={s1} isWinner={win1} isPlayed={isPlayed} />
      <TeamSlot code={match.team2} real={t2} score={s2} isWinner={win2} isPlayed={isPlayed} />
    </div>
  )
}

export default function Bracket({ matches, groups }) {
  const [activeRound, setActiveRound] = useState('Round of 32')
  const resolve = useMemo(() => buildResolver(groups, matches), [groups, matches])
  const roundMatches = useMemo(() => matches.filter((m) => m.round === activeRound), [matches, activeRound])
  const cols = activeRound === 'Round of 32' ? 2 : 1

  return (
    <div className="bracket">
      <div className="bk-nav">
        {ROUNDS.map(({ key, label }) => {
          const ms = matches.filter((m) => m.round === key)
          const played = ms.filter((m) => m.score?.ft).length
          return (
            <button key={key} className={`bk-tab${activeRound === key ? ' active' : ''}`}
              onClick={() => setActiveRound(key)}>
              {label}
              <span className="bk-count">{played}/{ms.length}</span>
            </button>
          )
        })}
      </div>
      <div className={`bk-grid cols-${cols}`}>
        {roundMatches.map((m) => (
          <BracketMatch key={m.num} match={m} resolve={resolve} />
        ))}
      </div>
    </div>
  )
}
