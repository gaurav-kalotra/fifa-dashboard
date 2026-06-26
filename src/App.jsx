import { useState, useEffect, useMemo, useRef } from 'react'
import { computeGroups } from './utils'
import SNAPSHOT from './data/snapshot'
import Matches from './components/Matches'
import Games from './components/Games'
import Standings from './components/Standings'
import Bracket from './components/Bracket'
import Schedule from './components/Schedule'
import Ticker from './components/Ticker'
import './index.css'

const DATA_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'
const TV_TABS = ['matches', 'fixtures']

const isTV = new URLSearchParams(window.location.search).get('tv') === '1'

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
    // 2 phases × 2.5s each per pair, plus 5s buffer, min 30s
    fixtureDurRef.current = Math.max(30_000, pairs * 2 * 2500 + 5_000)
  }, [matches, isTV])

  useEffect(() => {
    if (!isTV) return
    document.body.classList.add('tv-mode')
    tabChangeRef.current = Date.now()

    // Check every 500ms whether enough time has passed for current tab
    const tick = setInterval(() => {
      setTab(t => {
        const dur = t === 'fixtures' ? fixtureDurRef.current : 30_000
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

  if (isTV) {
    return (
      <div className={`tv-frame${hasLive ? '' : ' no-live-idle'}`}>
        <Stars />
        <div className="tv-orb tv-orb-1" />
        <div className="tv-orb tv-orb-2" />
        <div className="tv-orb tv-orb-3" />
        <div className="tv-orb tv-orb-4" />
        <div className="tv-bloom" />

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
                <span key={t} className={`tv-tab-pip${tab === t ? ' active' : ''}`}>
                  {t === 'matches' ? 'MATCHES' : 'FIXTURES'}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="tv-progress" key={tab} />

        <div className="tv-content" key={`c-${tab}`}>
          {tab === 'matches' && <Matches matches={matches} groups={groups} onLiveChange={setHasLive} />}
          {tab === 'fixtures' && <Schedule groups={groups} matches={matches} />}
        </div>

        <Ticker matches={matches} groups={groups} />
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
