import { useMemo, useState, useEffect } from 'react'
import { ab, flagUrl } from '../utils'
import playerManifest from '../playerManifest.json'
import PLAYER_NUMBERS, { PLAYER_TEAMS } from '../playerNumbers'

const ESPN_LEADERS = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/seasons/2026/types/1/leaders'
const ESPN_ATHLETE = id =>
  `https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/seasons/2026/athletes/${id}?lang=en&region=us`

const lastNameIdx = {}
for (const key of Object.keys(playerManifest)) {
  const ln = key.split(' ').pop().toLowerCase()
  ;(lastNameIdx[ln] = lastNameIdx[ln] || []).push(key)
}

function stripDiacritics(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function localPhoto(rawName) {
  if (!rawName) return null
  const name = stripDiacritics(rawName)
  if (playerManifest[name]) return playerManifest[name]
  const parts = name.split(' ')
  if (parts.length >= 2) {
    const abbr = `${parts[0][0]}. ${parts.slice(1).join(' ')}`
    if (playerManifest[abbr]) return playerManifest[abbr]
  }
  const ln = parts[parts.length - 1].toLowerCase()
  const candidates = lastNameIdx[ln] || []
  if (candidates.length === 1) return playerManifest[candidates[0]]
  if (candidates.length > 1) {
    const initial = parts[0][0].toUpperCase()
    const hit = candidates.find(c => c.startsWith(initial + '.') || c.startsWith(initial + ' '))
    return playerManifest[hit || candidates[0]]
  }
  return null
}

// Award contenders (pre-tournament editorial picks)
const GOLDEN_BALL = [
  { name: 'Lionel Messi',       team: 'Argentina' },
  { name: 'Kylian Mbappé',      team: 'France'    },
  { name: 'Vinícius Júnior',    team: 'Brazil'    },
  { name: 'Jude Bellingham',    team: 'England'   },
  { name: 'Erling Haaland',     team: 'Norway'    },
]

const GOLDEN_GLOVE = [
  { name: 'Emiliano Martínez',  team: 'Argentina'   },
  { name: 'Alisson Becker',     team: 'Brazil'      },
  { name: 'Mike Maignan',       team: 'France'      },
  { name: 'Thibaut Courtois',   team: 'Belgium'     },
  { name: 'Yann Sommer',        team: 'Switzerland' },
]

const BEST_YOUNG = [
  { name: 'Lamine Yamal',   team: 'Spain'   },
  { name: 'Endrick',        team: 'Brazil'  },
  { name: 'Kobbie Mainoo',  team: 'England' },
  { name: 'Mathys Tel',     team: 'France'  },
  { name: 'Pedri',          team: 'Spain'   },
]

const HISTORY = [
  // WC2026 tournament facts
  { icon: '🐐', ctx: 'WC2026',  text: 'Messi scored 6 goals in the group stage — Argentina won all 3 games' },
  { icon: '🇵🇾', ctx: 'WC2026', text: 'Paraguay eliminated Germany on penalties in the R32 — biggest upset so far' },
  { icon: '🇲🇦', ctx: 'WC2026', text: 'Morocco eliminated Netherlands on penalties — Africa making waves again' },
  { icon: '🎯', ctx: 'WC2026',  text: 'Jonathan David scored a hat-trick in Canada\'s historic 6-0 win over Qatar' },
  { icon: '🔥', ctx: 'WC2026',  text: 'Dembélé hat-trick sent France through — they\'ve conceded just 2 in the group' },
  { icon: '💥', ctx: 'WC2026',  text: 'Germany 7-1 Curaçao — biggest win of the group stage' },
  { icon: '⚽', ctx: 'WC2026',  text: 'Brazil through to R16 — Vinícius scored 4 goals in the group stage' },
  { icon: '🇳🇴', ctx: 'WC2026', text: 'Haaland scored 4 goals as Norway qualified for the last 32' },
  { icon: '🌟', ctx: 'WC2026',  text: 'Lamine Yamal scored in Spain\'s 4-0 win over Saudi Arabia at just 18 years old' },
  { icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', ctx: 'WC2026', text: 'Harry Kane scored 4 goals in the group stage as England topped Group L' },
  // Historical
  { icon: '👑', ctx: 'HISTORY', text: 'Argentina are the defending World Cup champions (Qatar 2022)' },
  { icon: '🏆', ctx: 'TRIVIA',  text: 'FIFA World Cup Trophy is 18-carat gold — 36 cm tall, 6.175 kg' },
  { icon: '🇧🇷', ctx: 'HISTORY', text: 'Brazil hold the record with 5 World Cup titles' },
  { icon: '⚽', ctx: 'HISTORY',  text: 'Germany & Italy have each lifted the trophy 4 times' },
  { icon: '🔥', ctx: 'HISTORY',  text: 'France chasing back-to-back titles — last done by Brazil in 1958 & 1962' },
  { icon: '🌍', ctx: 'HISTORY',  text: 'Morocco made history as the first African semi-finalists at Qatar 2022' },
  { icon: '🎯', ctx: 'HISTORY',  text: 'Ronaldo scored a brace vs Uzbekistan — netting in his 6th consecutive World Cup' },
  { icon: '🧤', ctx: 'HISTORY',  text: 'Emiliano Martínez won the Golden Glove at Qatar 2022 — back to defend it' },
]

function getAthleteId(ref) {
  if (!ref) return null
  return ref.replace(/\?.*/,'').split('/').pop()
}

function shuffle(arr, seed) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor((Math.sin(seed + i * 7.31) * 0.5 + 0.5) * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function awardItem(rank, player, ctx, type) {
  return {
    ctx,
    ctxAward: true,
    rank,
    text: player.name,
    number: PLAYER_NUMBERS[player.name] ?? null,
    photo: localPhoto(player.name),
    teams: [player.team],
    type,
  }
}

export default function Ticker({ matches, groups, isTV }) {
  const [espnScorers, setEspnScorers] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(ESPN_LEADERS)
        const d = await r.json()
        const goals = d.categories?.find(c => c.name === 'goalsLeaders')
        const top10 = (goals?.leaders || []).slice(0, 10)
        const scorers = (await Promise.all(
          top10.map(async l => {
            const id = getAthleteId(l.athlete?.['$ref'])
            if (!id) return null
            try {
              const ar = await fetch(ESPN_ATHLETE(id))
              const ad = await ar.json()
              const name = ad.displayName || ad.fullName || ''
              return { name, goals: l.value, photo: localPhoto(name), team: ad.team?.displayName || '' }
            } catch { return null }
          })
        )).filter(Boolean)
        setEspnScorers(scorers)
      } catch {}
    }
    load()
    const iv = setInterval(load, 2 * 60_000)
    return () => clearInterval(iv)
  }, [])

  const items = useMemo(() => {
    const played = matches.filter(m => m.score?.ft)
    const seed = played.length

    // Award blocks — capped at 5 in TV mode so all 4 lists get airtime
    const cap = isTV ? 5 : 99
    const goldenBallBlock  = GOLDEN_BALL.slice(0, cap).map((p, i) => awardItem(i + 1, p, '🏅', 'stat'))
    const goldenGloveBlock = GOLDEN_GLOVE.slice(0, cap).map((p, i) => awardItem(i + 1, p, '🧤', 'stat'))
    const bestYoungBlock   = BEST_YOUNG.slice(0, cap).map((p, i) => awardItem(i + 1, p, '🌟', 'stat'))

    const goldenBootBlock = espnScorers.slice(0, cap).map((s, i) => {
      const natTeam = PLAYER_TEAMS[s.name] || s.team || ''
      return {
        ctx: '🥾', ctxAward: true,
        rank: i + 1,
        text: `${s.name} – ${s.goals} goal${s.goals !== 1 ? 's' : ''}`,
        number: PLAYER_NUMBERS[s.name] ?? null,
        photo: s.photo,
        teams: natTeam ? [natTeam] : [],
        type: 'stat',
      }
    })

    // Filler: live stats + history (shuffled individually)
    const filler = []

    const all = Object.values(groups || {}).flat()
    if (all.length) {
      const top = [...all].sort((a, b) => b.gf - a.gf)[0]
      if (top?.gf >= 3)
        filler.push({ icon: '⚡', ctx: 'ATTACK', text: `${ab(top.t)} lead all teams with ${top.gf} goals scored`, type: 'stat', teams: [top.t] })
      const def = [...all].filter(e => e.p >= 2).sort((a, b) => a.ga - b.ga)[0]
      if (def?.ga === 0)
        filler.push({ icon: '🛡️', ctx: 'DEFENSE', text: `${ab(def.t)} — ${def.p} games played, yet to concede`, type: 'stat', teams: [def.t] })
    }

    if (played.length) {
      const big = [...played].sort((a, b) =>
        Math.abs(b.score.ft[0] - b.score.ft[1]) - Math.abs(a.score.ft[0] - a.score.ft[1])
      )[0]
      const diff = Math.abs(big.score.ft[0] - big.score.ft[1])
      if (diff >= 3) {
        const [s1, s2] = big.score.ft
        filler.push({ icon: '🔥', ctx: 'BIGGEST WIN', text: `${ab(big.team1)} ${s1}–${s2} ${ab(big.team2)}`, type: 'record', teams: [big.team1, big.team2] })
      }
    }

    filler.push(...HISTORY)
    const shuffledFiller = shuffle(filler, seed)

    // Award groups in shuffled order, filler interleaved between them
    const awardGroups = shuffle(
      [goldenBallBlock, goldenBootBlock, goldenGloveBlock, bestYoungBlock].filter(g => g.length),
      seed * 1.9
    )

    const result = []
    const chunkSize = Math.ceil(shuffledFiller.length / (awardGroups.length + 1))
    result.push(...shuffledFiller.slice(0, chunkSize))
    awardGroups.forEach((group, i) => {
      result.push(...group)
      result.push(...shuffledFiller.slice((i + 1) * chunkSize, (i + 2) * chunkSize))
    })

    return result
  }, [matches, groups, espnScorers])

  if (!items.length) return null

  const displayItems = isTV ? items.slice(0, 40) : items
  const duration = Math.max(360, displayItems.length * 22)
  const doubled = [...displayItems, ...displayItems]

  return (
    <div className="ticker">
      <div className="ticker-badge">
        <img src="/assets/wc-trophy2.png" alt="" className="ticker-trophy-icon" />
        <span>WC2026</span>
      </div>
      <div className="ticker-track">
        <div
          className="ticker-scroll"
          key={`tk-${items.length}`}
          style={{ animationDuration: `${duration}s` }}
        >
          {doubled.map((item, i) => {
            const tkFlag = item.teams?.length === 1 ? flagUrl(item.teams[0]) : null
            return (
            <span key={i} className={`ticker-item ${item.type}`}
              style={tkFlag ? { '--tkflag': `url("${tkFlag}")` } : {}}>
              <span className={item.ctxAward ? 'ticker-ctx ticker-award-icon' : 'ticker-ctx'}>{item.ctx}</span>
              {item.rank != null && <span className="ticker-rank">{item.rank}</span>}
              {item.photo
                ? <img src={item.photo} alt="" className="ticker-player-photo" onError={e => { e.target.style.display = 'none' }} />
                : item.icon === '🏆'
                  ? <img src="/assets/wc-trophy2.png" alt="" className="ticker-trophy-icon" />
                  : <span className="ticker-item-icon">{item.icon}</span>}
              {item.text}
              {item.number != null && <span className="ticker-jersey">#{item.number}</span>}
              {item.teams?.map(t => {
                const f = flagUrl(t)
                return f ? <img key={t} src={f} alt={t} className="ticker-flag" /> : null
              })}
              <span className="ticker-sep">◆</span>
            </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
