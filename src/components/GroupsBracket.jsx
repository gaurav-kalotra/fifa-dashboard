import { useMemo } from 'react'
import { ab, flagUrl, buildResolver } from '../utils'

const GROUP_ORDER = 'ABCDEFGHIJKL'.split('')
const ROUND_ORDER = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final']
const ROUND_LABEL = {
  'Round of 32': 'R32', 'Round of 16': 'R16',
  'Quarter-final': 'QF', 'Semi-final': 'SF', 'Final': 'Final'
}

function getActiveRound(matches) {
  for (const r of [...ROUND_ORDER].reverse()) {
    if (matches.filter(m => m.round === r).some(m => m.score?.ft)) return r
  }
  return 'Round of 32'
}

function Flag({ name, size = 'sm' }) {
  const url = flagUrl(name)
  if (!url) return <span className={`gb-abbr-only gb-${size}`}>{ab(name)}</span>
  return (
    <img src={url} alt={ab(name)} className={`gb-flag gb-${size}`}
      onError={e => { e.target.style.display = 'none' }} />
  )
}

function MiniGroup({ letter, entries }) {
  if (!entries?.length) return null
  return (
    <div className="gb-mini-group">
      <div className="gb-mini-header">
        <span className="gb-mini-letter">{letter}</span>
      </div>
      {entries.map((e, i) => (
        <div key={e.t} className={`gb-mini-row${i < 2 ? ' adv' : ''}`}>
          <span className="gb-mini-pos">{i + 1}</span>
          <Flag name={e.t} size="xs" />
          <span className="gb-mini-name">{ab(e.t)}</span>
          <span className="gb-mini-pts">{e.pts}</span>
        </div>
      ))}
    </div>
  )
}

function BracketCard({ match, resolve }) {
  const t1 = resolve(match.team1)
  const t2 = resolve(match.team2)
  const ft = match.score?.ft
  const [s1, s2] = ft || []
  const played = !!ft
  const win1 = played && s1 > s2
  const win2 = played && s2 > s1

  return (
    <div className={`gb-bk-card${played ? ' played' : ''}`}>
      <span className="gb-bk-num">M{match.num}</span>
      <div className="gb-bk-teams">
        <div className={`gb-bk-team${win1 ? ' win' : ''}`}>
          {t1 && <Flag name={t1} />}
          <span>{t1 ? ab(t1) : match.team1}</span>
        </div>
        <div className="gb-bk-vs">
          {played ? <span className="gb-bk-score">{s1}–{s2}</span> : <span className="gb-bk-tbd">vs</span>}
        </div>
        <div className={`gb-bk-team right${win2 ? ' win' : ''}`}>
          <span>{t2 ? ab(t2) : match.team2}</span>
          {t2 && <Flag name={t2} />}
        </div>
      </div>
    </div>
  )
}

export default function GroupsBracket({ groups, matches }) {
  const activeRound = useMemo(() => getActiveRound(matches), [matches])
  const resolve = useMemo(() => buildResolver(groups, matches), [groups, matches])
  const bkMatches = useMemo(() => matches.filter(m => m.round === activeRound), [matches, activeRound])
  const played = bkMatches.filter(m => m.score?.ft).length

  return (
    <div className="gb-layout">
      <div className="gb-groups-panel">
        <div className="gb-panel-title">
          <span className="gb-title-icon">⚽</span>
          Group Standings
        </div>
        <div className="gb-groups-grid">
          {GROUP_ORDER.map(g => <MiniGroup key={g} letter={g} entries={groups[g]} />)}
        </div>
      </div>

      <div className="gb-divider">
        <div className="gb-divider-line" />
      </div>

      <div className="gb-bracket-panel">
        <div className="gb-panel-title">
          <span className="gb-title-icon">🏆</span>
          {ROUND_LABEL[activeRound]}
          <span className="gb-played-badge">{played}/{bkMatches.length}</span>
        </div>
        <div className={`gb-bk-grid${bkMatches.length <= 4 ? ' cols-1' : bkMatches.length <= 8 ? ' cols-1' : ' cols-2'}`}>
          {bkMatches.map(m => <BracketCard key={m.num} match={m} resolve={resolve} />)}
        </div>
      </div>
    </div>
  )
}
