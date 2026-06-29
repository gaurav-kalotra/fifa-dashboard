import { useState, useEffect, useMemo, useRef } from 'react'
import { computeGroups, flagUrl } from './utils'
import SNAPSHOT from './data/snapshot'
import Matches from './components/Matches'
import Games from './components/Games'
import Standings from './components/Standings'
import Bracket from './components/Bracket'
import { ab } from './utils'
import Schedule from './components/Schedule'
import Ticker from './components/Ticker'
import playerManifest from './playerManifest.json'
import PLAYER_NUMBERS from './playerNumbers'
import './index.css'

const FACE_ENTRIES = Object.entries(playerManifest) // [name, path]
const FACE_DURATION = Math.round(FACE_ENTRIES.length * 22)

const FACE_TEAM_RANGES = [
  [0,25,'Belgium'],[26,51,'France'],[52,75,'Croatia'],[76,104,'Brazil'],
  [105,129,'Uruguay'],[130,159,'Spain'],[160,184,'England'],[185,208,'Japan'],
  [209,232,'Senegal'],[233,254,'Bosnia & Herzegovina'],[255,279,'Serbia'],
  [280,304,'Switzerland'],[305,329,'Mexico'],[330,354,'South Korea'],
  [355,369,'Italy'],[370,379,'Australia'],[380,414,'Denmark'],
  [415,439,'Iran'],[440,464,'Saudi Arabia'],[465,499,'Poland'],
  [500,524,'Germany'],[525,559,'Wales'],[560,584,'Netherlands'],
  [585,609,'Ghana'],[610,634,'Cameroon'],[635,649,'Qatar'],
  [650,659,'Egypt'],[660,694,'Ecuador'],[695,714,'USA'],
  [715,739,'Canada'],[740,764,'Argentina'],[765,789,'Portugal'],
  [790,814,'Tunisia'],[815,849,'Honduras'],[850,882,'Morocco'],
]
const FACE_TEAM_MAP = {}
for (const [start, end, team] of FACE_TEAM_RANGES)
  for (let i = start; i <= end; i++)
    if (FACE_ENTRIES[i]) FACE_TEAM_MAP[FACE_ENTRIES[i][0]] = team

function FaceTicker() {
  const doubled = [...FACE_ENTRIES, ...FACE_ENTRIES]
  return (
    <div className="face-ticker">
      <div className="face-ticker-scroll" style={{ animationDuration: `${FACE_DURATION}s` }}>
        {doubled.map(([name, src], i) => {
          const flag = flagUrl(FACE_TEAM_MAP[name])
          return (
            <span key={i} className="face-ticker-item"
              style={flag ? { '--ftflag': `url("${flag}")` } : {}}>
              <img src={src} alt="" className="face-ticker-img"
                onError={e => { e.currentTarget.style.display = 'none' }} />
              <span className="face-ticker-name">{name}</span>
              {PLAYER_NUMBERS[name] != null && <span className="face-ticker-num">#{PLAYER_NUMBERS[name]}</span>}
            </span>
          )
        })}
      </div>
    </div>
  )
}

const DATA_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'
const TV_TABS = ['matches', 'fixtures', 'bracket']

const isTV = true

// Fewer stars for better Pi performance
const STARS = Array.from({ length: 18 }, (_, i) => ({
  x: (i * 37.3 + 11.7) % 100,
  y: (i * 61.7 + 3.2) % 100,
  size: 1.5 + (i % 3) * 0.8,
  dur: 3.5 + (i % 4) * 1.2,
  delay: (i * 0.7) % 8,
  op: 0.15 + (i % 4) * 0.08,
}))

function Stars() {
  return (
    <div className="stars-layer" aria-hidden="true">
      {STARS.map((s, i) => (
        <span key={i} className="star" style={{
          left: `${s.x}%`, top: `${s.y}%`,
          width: `${s.size}px`, height: `${s.size}px`,
          animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s`,
          opacity: s.op,
        }} />
      ))}
    </div>
  )
}

const WC_LOGO_PNG = '/assets/wc-logo.png'

export default function App() {
  const [tab, setTab] = useState(isTV ? TV_TABS[0] : 'games')
  const [matches, setMatches] = useState(SNAPSHOT.matches)
  const [dataStatus, setDataStatus] = useState('snapshot')
  const tabChangeRef = useRef(Date.now())
  const fixtureDurRef = useRef(30_000)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(DATA_URL, { cache: 'no-store' })
        if (!res.ok) throw new Error()
        const data = await res.json()
        setMatches(data.matches || [])
        setDataStatus('live')
      } catch {
        setDataStatus(s => s === 'live' ? 'stale' : 'error')
      }
    }
    load()
    const interval = setInterval(load, 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Compute fixture-page duration based on today's group match pairs
  const groups = useMemo(() => computeGroups(matches), [matches])
  useEffect(() => {
    if (!isTV) return
    const today = new Date().toISOString().slice(0, 10)
    const leftPairs = matches.filter(m => {
      const g = m.group?.replace(/^Group\s+/i,'').toUpperCase()
      return m.date === today && m.group && 'ABCDEF'.includes(g) && !m.score?.ft
    }).length
    const rightPairs = matches.filter(m => {
      const g = m.group?.replace(/^Group\s+/i,'').toUpperCase()
      return m.date === today && m.group && 'GHIJKL'.includes(g) && !m.score?.ft
    }).length
    const pairs = Math.max(leftPairs, rightPairs)
    // 2 phases × 6s each per pair, plus 6s buffer, min 30s
    fixtureDurRef.current = Math.max(30_000, pairs * 2 * 6000 + 6_000)
  }, [matches, isTV])

  const switchTab = (next) => {
    tabChangeRef.current = Date.now()
    setTab(next)
  }

  useEffect(() => {
    if (!isTV) return
    document.body.classList.add('tv-mode')
    tabChangeRef.current = Date.now()

    // Check every 500ms whether enough time has passed for current tab
    const tick = setInterval(() => {
      setTab(t => {
        const live = hasLiveRef.current
        const dur = t === 'fixtures'
          ? (live ? 10_000 : fixtureDurRef.current)   // brief glimpse when live, normal otherwise
          : (live ? 50_000 : 30_000)                   // linger on matches when live
        if (Date.now() - tabChangeRef.current >= dur) {
          tabChangeRef.current = Date.now()
          return TV_TABS[(TV_TABS.indexOf(t) + 1) % TV_TABS.length]
        }
        return t
      })
    }, 500)

    return () => {
      clearInterval(tick)
      document.body.classList.remove('tv-mode')
    }
  }, [])

  const [hasLive, setHasLive] = useState(false)
  const [liveMatches, setLiveMatches] = useState([])
  const hasLiveRef = useRef(false)
  useEffect(() => { hasLiveRef.current = hasLive }, [hasLive])

  if (isTV) {
    return (
      <div className={`tv-frame${hasLive ? '' : ' no-live-idle'}`}>
        <Stars />
        <div className="tv-orb tv-orb-1" />
        <div className="tv-orb tv-orb-2" />
        <div className="tv-orb tv-orb-3" />
        <div className="tv-orb tv-orb-4" />
        <div className="tv-bloom" />

        <FaceTicker />
        <div className="tv-header">
          <div className="tv-header-center">
            <div className="tv-title-row">
              <img src={WC_LOGO_PNG} alt="" className="tv-trophy-img" aria-hidden="true" />
              <div className="tv-title">FIFA World Cup 2026</div>
              <img src={WC_LOGO_PNG} alt="" className="tv-trophy-img" aria-hidden="true" />
            </div>
            <div className="tv-subtitle">
              <span>CANADA</span><span className="tv-sub-dot">·</span><span>UNITED STATES</span><span className="tv-sub-dot">·</span><span>MEXICO</span>
            </div>
            <div className="tv-tabs-indicator">
              {TV_TABS.map(t => (
                <button key={t} className={`tv-tab-pip${tab === t ? ' active' : ''}`}
                  onClick={() => switchTab(t)}>
                  {t === 'matches' ? 'MATCHES' : t === 'fixtures' ? 'FIXTURES' : 'BRACKET'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="tv-progress" key={tab} />

        {/* Both components stay mounted so live-state (sidePanelMode etc.) survives tab switches */}
        <div className="tv-content" style={{display: tab === 'matches' ? '' : 'none'}}>
          <Matches matches={matches} groups={groups} onLiveChange={setHasLive} onLiveMatchesChange={setLiveMatches} />
        </div>
        <div className="tv-content" style={{display: tab === 'fixtures' ? '' : 'none'}}>
          <Schedule groups={groups} matches={matches} />
        </div>
        <div className="tv-content" style={{display: tab === 'bracket' ? '' : 'none'}}>
          <Bracket matches={matches} groups={groups} liveMatches={liveMatches} />
        </div>

        <Ticker matches={matches} groups={groups} isTV={isTV} />
      </div>
    )
  }

  // Regular (non-TV) mode
  const ALL_TABS = ['games', 'standings', 'bracket']
  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">⚽</span>
            <div>
              <h1>FIFA World Cup 2026</h1>
              <p>United States · Canada · Mexico</p>
            </div>
          </div>
          <nav className="tabs">
            {ALL_TABS.map(t => (
              <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </nav>
          <div
            className={`status-dot status-${dataStatus}`}
            title={dataStatus === 'live' ? 'Live data' : dataStatus === 'snapshot' ? 'Loading…' : 'Cached data'}
          />
        </div>
      </header>
      <main className="main">
        {tab === 'games' && <Games matches={matches} />}
        {tab === 'standings' && <Standings groups={groups} />}
        {tab === 'bracket' && <Bracket matches={matches} groups={groups} />}
      </main>
    </div>
  )
}
