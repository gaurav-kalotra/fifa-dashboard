import { useState, useEffect, useMemo, useRef } from 'react'
import { computeGroups } from './utils'
import SNAPSHOT from './data/snapshot'
import Games from './components/Games'
import Standings from './components/Standings'
import Bracket from './components/Bracket'
import './index.css'

const DATA_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'
const TV_TABS = ['games', 'standings', 'bracket']
const TV_INTERVAL_MS = 25_000

const isTV = new URLSearchParams(window.location.search).get('tv') === '1'

export default function App() {
  const [tab, setTab] = useState('games')
  const [matches, setMatches] = useState(SNAPSHOT.matches)
  const [dataStatus, setDataStatus] = useState('snapshot')
  const cursorTimer = useRef(null)

  // data fetch
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(DATA_URL, { cache: 'no-store' })
        if (!res.ok) throw new Error()
        const data = await res.json()
        setMatches(data.matches || [])
        setDataStatus('live')
      } catch {
        setDataStatus((s) => (s === 'live' ? 'stale' : 'error'))
      }
    }
    load()
    const interval = setInterval(load, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // TV: auto-rotate tabs + hide cursor
  useEffect(() => {
    if (!isTV) return
    document.body.classList.add('tv-mode')

    const rotateTabs = setInterval(() => {
      setTab((t) => {
        const idx = TV_TABS.indexOf(t)
        return TV_TABS[(idx + 1) % TV_TABS.length]
      })
    }, TV_INTERVAL_MS)

    const hideCursor = () => {
      document.body.style.cursor = 'none'
      clearTimeout(cursorTimer.current)
    }
    const showCursor = () => {
      document.body.style.cursor = ''
      clearTimeout(cursorTimer.current)
      cursorTimer.current = setTimeout(hideCursor, 3000)
    }
    hideCursor()
    document.addEventListener('mousemove', showCursor)

    return () => {
      clearInterval(rotateTabs)
      document.removeEventListener('mousemove', showCursor)
      document.body.classList.remove('tv-mode')
    }
  }, [])

  const groups = useMemo(() => computeGroups(matches), [matches])

  if (isTV) {
    return (
      <div className="tv-frame">
        <div className="tv-header">
          <span className="tv-title">FIFA World Cup 2026</span>
          <div className="tv-tabs">
            {TV_TABS.map((t) => (
              <span key={t} className={`tv-tab-dot${tab === t ? ' active' : ''}`} />
            ))}
          </div>
          <div className={`status-dot status-${dataStatus}`} />
        </div>
        <div className="tv-content">
          {tab === 'games' && <Games matches={matches} />}
          {tab === 'standings' && <Standings groups={groups} />}
          {tab === 'bracket' && <Bracket matches={matches} groups={groups} />}
        </div>
      </div>
    )
  }

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
            {TV_TABS.map((t) => (
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
