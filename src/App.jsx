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
const TV_TABS = ['matches', 'schedule']
const TV_INTERVAL_MS = 30_000

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

export default function App() {
  const [tab, setTab] = useState(isTV ? TV_TABS[0] : 'games')
  const [matches, setMatches] = useState(SNAPSHOT.matches)
  const [dataStatus, setDataStatus] = useState('snapshot')
  const cursorTimer = useRef(null)

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
    const interval = setInterval(load, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!isTV) return
    document.body.classList.add('tv-mode')

    const rotate = setInterval(() => {
      setTab(t => {
        const idx = TV_TABS.indexOf(t)
        return TV_TABS[(idx + 1) % TV_TABS.length]
      })
    }, TV_INTERVAL_MS)

    const hide = () => {
      document.body.style.cursor = 'none'
      clearTimeout(cursorTimer.current)
    }
    const show = () => {
      document.body.style.cursor = ''
      clearTimeout(cursorTimer.current)
      cursorTimer.current = setTimeout(hide, 3000)
    }
    hide()
    document.addEventListener('mousemove', show)
    return () => {
      clearInterval(rotate)
      document.removeEventListener('mousemove', show)
      document.body.classList.remove('tv-mode')
    }
  }, [])

  const groups = useMemo(() => computeGroups(matches), [matches])

  if (isTV) {
    return (
      <div className="tv-frame">
        <Stars />
        <div className="tv-orb tv-orb-1" />
        <div className="tv-orb tv-orb-2" />
        <div className="tv-orb tv-orb-3" />
        <div className="tv-orb tv-orb-4" />
        <div className="tv-bloom" />

        <div className="tv-header">
          <div className="tv-title-block">
            <span className="tv-trophy">🏆</span>
            <div>
              <div className="tv-title">FIFA World Cup 2026</div>
              <div className="tv-subtitle">United States · Canada · Mexico</div>
            </div>
          </div>
          <div className="tv-tabs-indicator">
            {TV_TABS.map(t => (
              <span key={t} className={`tv-tab-pip${tab === t ? ' active' : ''}`}>
                {t === 'matches' ? 'MATCHES' : 'SCHEDULE'}
              </span>
            ))}
          </div>
          <div className={`tv-status-badge status-${dataStatus}`}>
            <span className="tv-status-dot" />
            {dataStatus === 'live' ? 'LIVE' : dataStatus === 'snapshot' ? 'DATA' : 'CACHED'}
          </div>
        </div>

        <div className="tv-progress" key={tab} />

        <div className="tv-content" key={`c-${tab}`}>
          {tab === 'matches' && <Matches matches={matches} />}
          {tab === 'schedule' && <Schedule groups={groups} matches={matches} />}
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
