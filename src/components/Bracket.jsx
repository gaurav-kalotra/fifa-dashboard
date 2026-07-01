import { useEffect, useMemo, useState } from 'react'
import { ab, flagUrl, buildResolver, rawAbKey, fmtKickoffPT, fetchFifaKickoffMap } from '../utils'

const ROUNDS = [
  { key: 'Round of 32', label: 'R32' },
  { key: 'Round of 16', label: 'R16' },
  { key: 'Quarter-final', label: 'QF' },
  { key: 'Semi-final', label: 'SF' },
  { key: 'Final', label: 'Final' },
]

function TeamSlot({ code, real, score, penScore, isWinner, isLoser, isPlayed }) {
  const url = real ? flagUrl(real) : null
  const cls = [
    'bk-team',
    isWinner ? 'bk-winner' : '',
    isLoser  ? 'bk-loser'  : '',
    !isWinner && !isLoser && real && !isPlayed ? 'bk-pre' : '',
    !real && !isPlayed ? 'bk-tbd' : '',
  ].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      {url
        ? <img src={url} alt={ab(real)} className="bk-flag" onError={e => { e.target.style.display='none' }} />
        : <span className="bk-abbr">{real ? ab(real) : '—'}</span>}
      <span className="bk-name">{real ? ab(real) : code}</span>
      {score != null && (
        <span className="bk-score-wrap">
          <span className="bk-score">{score}</span>
          {penScore != null && <span className="bk-pen">({penScore}) PEN</span>}
        </span>
      )}
    </div>
  )
}

function BracketMatch({ match, resolve, liveMatches, fifaTimeMap }) {
  const t1 = resolve(match.team1)
  const t2 = resolve(match.team2)
  const ft = match.score?.ft
  const et = match.score?.et
  const pen = match.score?.p
  const display = et || ft
  const [s1, s2] = display || []
  const isPlayed = !!ft
  const win1 = isPlayed && (pen ? pen[0] > pen[1] : (s1 ?? 0) > (s2 ?? 0))
  const win2 = isPlayed && (pen ? pen[1] > pen[0] : (s2 ?? 0) > (s1 ?? 0))

  const a1 = t1 ? (ab(t1) || t1.slice(0,3).toUpperCase()) : null
  const a2 = t2 ? (ab(t2) || t2.slice(0,3).toUpperCase()) : null
  const isLive = !isPlayed && a1 && a2 && liveMatches?.some(lm =>
    (lm.homeAbbr === a1 && lm.awayAbbr === a2) ||
    (lm.homeAbbr === a2 && lm.awayAbbr === a1)
  )
  const kickoff = a1 && a2 ? fmtKickoffPT(fifaTimeMap?.[rawAbKey(a1, a2)]) : null

  return (
    <div className={`bk-match${isPlayed ? ' bk-played' : ''}${isLive ? ' bk-live' : ''}`}>
      {match.num && (
        <div className="bk-num">
          <span>Match {match.num}{pen ? <span className="bk-num-pen"> PEN</span> : et ? <span className="bk-num-pen"> AET</span> : ''}</span>
          {kickoff && <span className="bk-time">{kickoff}</span>}
        </div>
      )}
      <TeamSlot code={match.team1} real={t1} score={s1} penScore={pen?.[0] ?? null} isWinner={win1} isLoser={isPlayed && !win1} isPlayed={isPlayed} />
      <TeamSlot code={match.team2} real={t2} score={s2} penScore={pen?.[1] ?? null} isWinner={win2} isLoser={isPlayed && !win2} isPlayed={isPlayed} />
    </div>
  )
}

export default function Bracket({ matches, groups, liveMatches = [] }) {
  const [activeRound, setActiveRound] = useState('Round of 32')
  const [fifaTimeMap, setFifaTimeMap] = useState({})
  const resolve = useMemo(() => buildResolver(groups, matches), [groups, matches])
  const roundMatches = useMemo(() => matches.filter(m => m.round === activeRound), [matches, activeRound])
  const cols = activeRound === 'Round of 32' ? 2 : 1

  useEffect(() => {
    const load = async () => {
      try { setFifaTimeMap(await fetchFifaKickoffMap()) } catch {}
    }
    load()
    const iv = setInterval(load, 5 * 60_000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="bracket">
      <div className="bk-nav">
        {ROUNDS.map(({ key, label }) => {
          const ms = matches.filter(m => m.round === key)
          const played = ms.filter(m => m.score?.ft).length
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
        {roundMatches.map(m => (
          <BracketMatch key={m.num} match={m} resolve={resolve} liveMatches={liveMatches} fifaTimeMap={fifaTimeMap} />
        ))}
      </div>
    </div>
  )
}
