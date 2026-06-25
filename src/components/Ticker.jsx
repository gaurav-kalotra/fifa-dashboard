import { useMemo, useState, useEffect } from 'react'
import { ab } from '../utils'

const ESPN_LEADERS = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/seasons/2026/types/1/leaders'
const ESPN_ATHLETE = id =>
  `https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/seasons/2026/athletes/${id}?lang=en&region=us`

const FACTS = [
  { icon: '🏟️', ctx: 'WC2026',  text: '104 matches across 16 cities in USA, Canada & Mexico' },
  { icon: '👑', ctx: 'HISTORY', text: 'Argentina are the defending World Cup champions (Qatar 2022)' },
  { icon: '⭐', ctx: 'WC2026',  text: '48 teams — the largest FIFA World Cup in history' },
  { icon: '🌎', ctx: 'WC2026',  text: 'First World Cup ever co-hosted by 3 nations simultaneously' },
  { icon: '🏆', ctx: 'TRIVIA',  text: 'FIFA World Cup Trophy is 18-carat gold, weighing 6.175 kg' },
  { icon: '🇧🇷', ctx: 'HISTORY', text: 'Brazil hold the record with 5 World Cup titles' },
  { icon: '📅', ctx: 'WC2026',  text: 'Tournament runs June 11 – July 19, 2026' },
  { icon: '🏟️', ctx: 'VENUES',  text: 'MetLife Stadium (NY/NJ) hosts the final on July 19' },
  { icon: '🌐', ctx: 'WC2026',  text: '12 groups of 4 — top 2 plus 8 best 3rd-place advance to R32' },
  { icon: '⚽', ctx: 'HISTORY', text: 'Germany & Italy have each lifted the trophy 4 times' },
  { icon: '🔢', ctx: 'WC2026',  text: 'Vancouver, Toronto, Boston among host cities for first time' },
  { icon: '📺', ctx: 'WC2026',  text: 'WC2026 expected to draw over 5 billion global viewers' },
]

function getAthleteId(ref) {
  if (!ref) return null
  return ref.replace(/\?.*/,'').split('/').pop()
}

export default function Ticker({ matches, groups }) {
  const [espnScorers, setEspnScorers] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(ESPN_LEADERS)
        const d = await r.json()
        const goals = d.categories?.find(c => c.name === 'goalsLeaders')
        const top6 = (goals?.leaders || []).slice(0, 6)
        const scorers = (await Promise.all(
          top6.map(async l => {
            const id = getAthleteId(l.athlete?.['$ref'])
            if (!id) return null
            try {
              const ar = await fetch(ESPN_ATHLETE(id))
              const ad = await ar.json()
              return { name: ad.displayName || ad.fullName, goals: l.value }
            } catch { return null }
          })
        )).filter(Boolean)
        setEspnScorers(scorers)
      } catch {}
    }
    load()
    const iv = setInterval(load, 5 * 60_000)
    return () => clearInterval(iv)
  }, [])

  const items = useMemo(() => {
    const out = []

    // Recent results (last 12)
    const results = matches.filter(m => m.score?.ft).slice(-12)
    for (const m of results) {
      const [s1, s2] = m.score.ft
      const ctx = m.group?.replace('Group ', 'GRP ')
        || (m.round || '').replace('Round of ', 'R').replace('Quarter-final', 'QF').replace('Semi-final', 'SF')
      out.push({ icon: '⚽', ctx, text: `${ab(m.team1)} ${s1}–${s2} ${ab(m.team2)}`, type: 'result' })
    }

    // Upcoming (next 6 group matches)
    const upcoming = matches.filter(m => !m.score?.ft && m.group).slice(0, 6)
    for (const m of upcoming) {
      const ctx = m.group?.replace('Group ', 'GRP ') || ''
      out.push({ icon: '🗓️', ctx, text: `${ab(m.team1)} vs ${ab(m.team2)}`, type: 'upcoming' })
    }

    // ESPN top scorers
    for (const s of espnScorers) {
      out.push({ icon: '🥅', ctx: 'GOLDEN BOOT', text: `${s.name} – ${s.goals} goal${s.goals !== 1 ? 's' : ''}`, type: 'stat' })
    }

    // Qualification / elimination from computed standings
    for (const [g, entries] of Object.entries(groups || {})) {
      if (!entries?.length) continue
      if (entries[1]?.pts >= 6) {
        out.push({ icon: '✅', ctx: `GROUP ${g}`, text: `${ab(entries[0].t)} & ${ab(entries[1].t)} advance to Round of 32`, type: 'qual' })
      }
      const elim = entries.filter(e => e.p >= 2 && e.pts === 0)
      for (const e of elim) {
        out.push({ icon: '⚠️', ctx: `GROUP ${g}`, text: `${ab(e.t)} need a win to stay alive`, type: 'danger' })
      }
    }

    // Best attack / best defense
    const all = Object.values(groups || {}).flat()
    if (all.length) {
      const topAtk = [...all].sort((a, b) => b.gf - a.gf)[0]
      if (topAtk?.gf >= 4)
        out.push({ icon: '⚡', ctx: 'ATTACK', text: `${ab(topAtk.t)} lead the tournament with ${topAtk.gf} goals`, type: 'stat' })
      const topDef = [...all].filter(e => e.p > 0).sort((a, b) => a.ga - b.ga)[0]
      if (topDef?.ga === 0 && topDef.p >= 2)
        out.push({ icon: '🛡️', ctx: 'DEFENSE', text: `${ab(topDef.t)} – ${topDef.p} games played, zero goals conceded`, type: 'stat' })
    }

    // Biggest win
    const played = matches.filter(m => m.score?.ft)
    if (played.length) {
      const big = [...played].sort((a, b) => {
        const da = Math.abs(a.score.ft[0] - a.score.ft[1])
        const db = Math.abs(b.score.ft[0] - b.score.ft[1])
        return db - da
      })[0]
      const diff = Math.abs(big.score.ft[0] - big.score.ft[1])
      if (diff >= 3) {
        const [s1, s2] = big.score.ft
        out.push({ icon: '🔥', ctx: 'BIGGEST WIN', text: `${ab(big.team1)} ${s1}–${s2} ${ab(big.team2)}`, type: 'record' })
      }
    }

    // Rotate static facts based on played match count for variety
    const shift = played.length % FACTS.length
    out.push(...FACTS.slice(shift), ...FACTS.slice(0, shift))

    return out
  }, [matches, groups, espnScorers])

  if (!items.length) return null

  // Duration: 5s per item, minimum 100s
  const duration = Math.max(100, items.length * 5)
  const doubled = [...items, ...items]

  return (
    <div className="ticker">
      <div className="ticker-badge">
        <span className="ticker-icon">⚽</span>
        <span>WC2026</span>
      </div>
      <div className="ticker-track">
        <div
          className="ticker-scroll"
          key={`tk-${items.length}`}
          style={{ animationDuration: `${duration}s` }}
        >
          {doubled.map((item, i) => (
            <span key={i} className={`ticker-item ${item.type}`}>
              <span className="ticker-item-icon">{item.icon}</span>
              <span className="ticker-ctx">{item.ctx}</span>
              {item.text}
              <span className="ticker-sep">◆</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
