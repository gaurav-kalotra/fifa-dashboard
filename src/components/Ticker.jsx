import { useMemo, useState, useEffect } from 'react'
import { ab, flagUrl } from '../utils'

const ESPN_LEADERS = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/seasons/2026/types/1/leaders'
const ESPN_ATHLETE = id =>
  `https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/seasons/2026/athletes/${id}?lang=en&region=us`
const RAPIDAPI_KEY = import.meta.env.VITE_RAPIDAPI_KEY
const APIFOOTBALL_PLAYER = name =>
  `https://api-football-v1.p.rapidapi.com/v3/players?search=${encodeURIComponent(name)}&season=2024`
const TSDB_SEARCH = q =>
  `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(q)}`

function stripDiacritics(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

async function fetchPlayerPhoto(rawName) {
  const name = stripDiacritics(rawName)
  // Try API-Football first (best coverage) if key present
  if (RAPIDAPI_KEY) {
    try {
      const r = await fetch(APIFOOTBALL_PLAYER(name), {
        headers: { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com' }
      })
      const d = await r.json()
      const photo = d.response?.[0]?.player?.photo
      if (photo) return photo
    } catch {}
  }
  // Fallback: TheSportsDB (free, no key)
  try {
    const search = async q => {
      const r = await fetch(TSDB_SEARCH(q))
      const d = await r.json()
      const p = d.player?.[0]
      return p?.strCutout || p?.strThumb || null
    }
    return (await search(name)) || (await search(name.split(' ').pop()))
  } catch { return null }
}

const FACTS = [
  { icon: '🏟️', ctx: 'WC2026',  text: '104 matches across 16 cities in USA, Canada & Mexico' },
  { icon: '👑', ctx: 'HISTORY', text: 'Argentina are the defending World Cup champions (Qatar 2022)' },
  { icon: '⭐', ctx: 'WC2026',  text: '48 teams — the largest FIFA World Cup in history' },
  { icon: '🌎', ctx: 'WC2026',  text: 'First World Cup ever co-hosted by 3 nations simultaneously' },
  { icon: '🏆', ctx: 'TRIVIA',  text: 'FIFA World Cup Trophy is 18-carat gold, weighing 6.175 kg' },
  { icon: '🇧🇷', ctx: 'HISTORY', text: 'Brazil hold the record with 5 World Cup titles' },
  { icon: '📅', ctx: 'WC2026',  text: 'Tournament runs June 11 – July 19, 2026' },
  { icon: '🏟️', ctx: 'VENUES',  text: 'MetLife Stadium (NY/NJ) hosts the Final on July 19' },
  { icon: '🌐', ctx: 'WC2026',  text: '12 groups of 4 — top 2 plus 8 best 3rd-place teams advance' },
  { icon: '⚽', ctx: 'HISTORY', text: 'Germany & Italy have each lifted the trophy 4 times' },
  { icon: '🏙️', ctx: 'WC2026',  text: 'Vancouver, Toronto, Boston among host cities for first time' },
  { icon: '📺', ctx: 'WC2026',  text: 'WC2026 expected to draw over 5 billion global viewers' },
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

export default function Ticker({ matches, groups }) {
  const [espnScorers, setEspnScorers] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(ESPN_LEADERS)
        const d = await r.json()
        const goals = d.categories?.find(c => c.name === 'goalsLeaders')
        const top6  = (goals?.leaders || []).slice(0, 6)
        const scorers = (await Promise.all(
          top6.map(async l => {
            const id = getAthleteId(l.athlete?.['$ref'])
            if (!id) return null
            try {
              const ar = await fetch(ESPN_ATHLETE(id))
              const ad = await ar.json()
              const name = ad.displayName || ad.fullName || ''
              const photo = name ? await fetchPlayerPhoto(name) : null
              return {
                name,
                goals: l.value,
                jersey: ad.jersey || '',
                photo,
              }
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
    const played = matches.filter(m => m.score?.ft)

    matches.filter(m => !m.score?.ft && m.group).slice(0, 6).forEach(m => {
      out.push({ icon: '🗓️', ctx: m.group?.replace('Group ','GRP ') || '', text: `${ab(m.team1)} vs ${ab(m.team2)}`, type: 'upcoming', teams: [m.team1, m.team2] })
    })

    espnScorers.forEach(s => {
      out.push({
        icon: '🥅', ctx: 'GOLDEN BOOT',
        text: `${s.name}${s.jersey ? ` #${s.jersey}` : ''} – ${s.goals} goal${s.goals !== 1 ? 's' : ''}`,
        photo: s.photo,
        type: 'stat',
      })
    })

    for (const [g, entries] of Object.entries(groups || {})) {
      if (!entries?.length) continue
      if (entries[1]?.pts >= 6)
        out.push({ icon: '✅', ctx: `GROUP ${g}`, text: `${ab(entries[0].t)} & ${ab(entries[1].t)} advance to Round of 32`, type: 'qual', teams: [entries[0].t, entries[1].t] })
      entries.filter(e => e.p >= 2 && e.pts === 0).forEach(e =>
        out.push({ icon: '⚠️', ctx: `GROUP ${g}`, text: `${ab(e.t)} need a win to stay alive`, type: 'danger', teams: [e.t] })
      )
    }

    const all = Object.values(groups || {}).flat()
    if (all.length) {
      const top = [...all].sort((a, b) => b.gf - a.gf)[0]
      if (top?.gf >= 4)
        out.push({ icon: '⚡', ctx: 'ATTACK', text: `${ab(top.t)} lead the tournament with ${top.gf} goals scored`, type: 'stat', teams: [top.t] })
      const def = [...all].filter(e => e.p > 0).sort((a, b) => a.ga - b.ga)[0]
      if (def?.ga === 0 && def.p >= 2)
        out.push({ icon: '🛡️', ctx: 'DEFENSE', text: `${ab(def.t)} – ${def.p} games, zero goals conceded`, type: 'stat', teams: [def.t] })
    }

    if (played.length) {
      const big = [...played].sort((a, b) =>
        Math.abs(b.score.ft[0]-b.score.ft[1]) - Math.abs(a.score.ft[0]-a.score.ft[1])
      )[0]
      const diff = Math.abs(big.score.ft[0] - big.score.ft[1])
      if (diff >= 3) {
        const [s1, s2] = big.score.ft
        out.push({ icon: '🔥', ctx: 'BIGGEST WIN', text: `${ab(big.team1)} ${s1}–${s2} ${ab(big.team2)}`, type: 'record', teams: [big.team1, big.team2] })
      }
    }

    const shift = played.length % FACTS.length
    out.push(...FACTS.slice(shift), ...FACTS.slice(0, shift))

    return shuffle(out, played.length)
  }, [matches, groups, espnScorers])

  if (!items.length) return null

  // ~14s per item so each passes slowly enough to read comfortably
  const duration = Math.max(360, items.length * 22)
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
              {item.photo
                ? <img src={item.photo} alt="" className="ticker-player-photo" onError={e=>{e.target.style.display='none'}} />
                : <span className="ticker-item-icon">{item.icon}</span>}
              {item.teams?.map(t => {
                const f = flagUrl(t)
                return f ? <img key={t} src={f} alt={t} className="ticker-flag" /> : null
              })}
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
