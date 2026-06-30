import { useMemo, useState, useEffect, useRef } from 'react'
import { ab, flagUrl, buildTeamStatusMap, computeGroups, buildResolver } from '../utils'
import { MOCK_LIVE_MATCHES, MOCK_TIMELINES, MOCK_LINEUPS, MOCK_SOFA_DATA, MOCK_FIFA_MAP } from '../data/mockLive'

const DEMO = new URLSearchParams(window.location.search).has('demo')

// WC2026 host city → 2-letter state/province/state code
const CITY_STATE = {
  'Arlington':'TX','Dallas':'TX','Houston':'TX','Frisco':'TX',
  'Los Angeles':'CA','Inglewood':'CA','Santa Clara':'CA','San Francisco':'CA',
  'East Rutherford':'NJ','New York':'NJ',
  'Seattle':'WA','Miami':'FL','Atlanta':'GA',
  'Foxborough':'MA','Boston':'MA',
  'Kansas City':'MO','Philadelphia':'PA','Glendale':'AZ',
  'Toronto':'ON','Vancouver':'BC',
  'Mexico City':'CDMX','Guadalajara':'JAL','Monterrey':'NL',
}

// state/province code → host country name (for flag lookup)
const STATE_COUNTRY = {
  TX:'USA',CA:'USA',NJ:'USA',WA:'USA',FL:'USA',GA:'USA',MA:'USA',MO:'USA',PA:'USA',AZ:'USA',
  ON:'Canada',BC:'Canada',
  CDMX:'Mexico',JAL:'Mexico',NL:'Mexico',
}

// Full state/province names to strip when abbreviation will be added
const FULL_STATE_NAMES = [
  'New Jersey','New York','Texas','California','Washington','Florida',
  'Georgia','Massachusetts','Missouri','Pennsylvania','Arizona',
  'Ontario','British Columbia',
  'Jalisco','Nuevo León','Nuevo Leon',
]

function appendState(venue) {
  if (!venue) return venue
  // Strip full state names (redundant once abbreviation is added)
  let v = venue
  for (const name of FULL_STATE_NAMES) {
    v = v.replace(new RegExp(',\\s*' + name + '\\b', 'gi'), '')
  }
  v = v.replace(/,\s*,/g, ',').replace(/,\s*$/, '').trim()
  const city = Object.keys(CITY_STATE).find(c => v.includes(c))
  if (!city) return v
  const st = CITY_STATE[city]
  return v.includes(st) ? v : `${v}, ${st}`
}

function splitVenue(venue) {
  if (!venue) return { stadium: '', cityLine: '', country: null }
  const ci = venue.indexOf(',')
  const stadium = ci > 0 ? venue.slice(0, ci).trim() : venue
  const rest    = ci > 0 ? venue.slice(ci + 1).trim() : ''
  const stCode  = rest.split(',').pop().trim()
  const country = STATE_COUNTRY[stCode] || null
  return { stadium, cityLine: rest, country }
}

// ── FIFA (primary) ────────────────────────────────────────────
const FIFA_BASE      = 'https://api.fifa.com/api/v3'
const FIFA_COMP      = 17
const FIFA_SEASON    = '285023'
const FIFA_CALENDAR  = `${FIFA_BASE}/calendar/matches?idCompetition=${FIFA_COMP}&idSeason=${FIFA_SEASON}&language=en&count=500`
const FIFA_LIVE      = (s, m) => `${FIFA_BASE}/live/football/${FIFA_COMP}/${FIFA_SEASON}/${s}/${m}?language=en`
const FIFA_TIMELINE  = (s, m) => `${FIFA_BASE}/timelines/${FIFA_COMP}/${FIFA_SEASON}/${s}/${m}?language=en`
const FIFA_RANKINGS  = `${FIFA_BASE}/ranking/men?language=en`
const FIFA_POS_ABBR  = { 0:'GK', 1:'D', 2:'M', 3:'F' }
const SS_POWER_URL   = 'https://api.sofascore.com/api/v1/unique-tournament/16/season/58210/top-players/overall'

// Hardcoded FIFA Men's Rankings (WC2026 pre-tournament, June 2026)
// Used immediately so predictions show on load; overwritten if API returns live data
const RANKINGS_FALLBACK = {
  ARG:1,  FRA:2,  ENG:3,  BRA:4,  POR:5,  BEL:6,  NED:7,  ESP:8,
  COL:10, URU:11, DEN:12, MAR:13, USA:14, GER:15, CRO:16, SUI:17,
  MEX:18, SEN:20, JPN:22, AUT:25, KOR:26, AUS:24, NOR:33, SWE:27,
  TUR:29, CAN:44, ECU:41, PAR:58, KSA:55, CIV:51, GHA:54, EGY:34,
  ALG:37, UZB:77, COD:49, PAN:71, CPV:87, IRN:22, BIH:61, QAT:43,
  HAI:88, TUN:29, IRQ:68, NZL:95, SCO:35, JOR:89, CZE:38, CUW:98,
  RSA:64, SUI:17,
}

// ── ESPN (backup) ─────────────────────────────────────────────
const ESPN_BOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'
const ESPN_SUM   = id => `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${id}`

// ── SofaScore (ratings & assists) ────────────────────────────
const SS_LIVE   = 'https://api.sofascore.com/api/v1/sport/football/events/live'
const SS_LINEUP = id => `https://api.sofascore.com/api/v1/event/${id}/lineups`

// ── Key helpers ───────────────────────────────────────────────
// Keys are sorted 3-letter abbreviations: "ARG|MEX"
function rawAbKey(a, b) { return [a.toUpperCase(), b.toUpperCase()].sort().join('|') }
function abKey(t1, t2)  { return rawAbKey(ab(t1) || t1.slice(0,3), ab(t2) || t2.slice(0,3)) }

// ── Event type sets (FIFA) ────────────────────────────────────
const FT_GOAL    = new Set([0, 15])   // goal, penalty
const FT_OWNGOAL = new Set([12])
const FT_YELLOW  = new Set([3, 65])
const FT_RED     = new Set([4, 5])
const FT_SUB     = new Set([6, 19])   // substitution

function classifyFifaEvt(type) {
  if (FT_OWNGOAL.has(type)) return 'goal'
  if (FT_GOAL.has(type))    return 'goal'
  if (FT_YELLOW.has(type))  return 'yellow'
  if (FT_RED.has(type))     return 'red'
  if (FT_SUB.has(type))     return 'sub'
  return null
}

// ── Parsers ───────────────────────────────────────────────────
function parseFifaEventsFromTeams(fd) {
  const root = fd?.Results?.[0] ?? fd
  const out = []
  for (const [side, team] of [['home', root?.HomeTeam], ['away', root?.AwayTeam]]) {
    for (const ev of team?.Events || []) {
      const kind = classifyFifaEvt(ev.Type)
      if (!kind) continue
      const player = ev.PlayerName?.[0]?.Description
        || ev.NationalTeamPlayer?.PlayerName?.[0]?.Description
        || ev.Player?.Name?.[0]?.Description || ''
      const playerOn = kind === 'sub'
        ? (ev.SubstitutedPlayerName?.[0]?.Description || ev.PlayerName2?.[0]?.Description || '') : ''
      out.push({ min: String(ev.MatchMinute ?? ''), type: kind, player, playerOn, side })
    }
  }
  return out.sort((a, b) => (parseInt(a.min)||0) - (parseInt(b.min)||0))
}

function parseFifaTimeline(data) {
  // FIFA v3 API wraps responses in Results[0]; fall back to top-level if absent
  const root = data?.Results?.[0] ?? data
  const evts = root?.Event || root?.Events || data?.Event || data?.Events || []
  const out = []
  for (const ev of evts) {
    const kind = classifyFifaEvt(ev.Type)
    if (!kind) continue
    const hoa  = ev.HomeOrAway ?? ev.Team ?? ev.TeamSide ?? ''
    const hoaS = String(hoa).toLowerCase()
    const side = (hoa===1||hoaS==='home'||hoaS==='h') ? 'home'
               : (hoa===2||hoaS==='away'||hoaS==='a') ? 'away' : ''
    const player = ev.PlayerName?.[0]?.Description || ev.Player?.Name?.[0]?.Description
      || ev.NationalTeamPlayer?.PlayerName?.[0]?.Description || ''
    const playerOn = kind === 'sub'
      ? (ev.SubstitutedPlayerName?.[0]?.Description || ev.PlayerName2?.[0]?.Description || '') : ''
    out.push({ min: String(ev.MatchMinute ?? ev.Minute ?? ''), type: kind, player, playerOn, side })
  }
  return out.sort((a, b) => (parseInt(a.min)||0) - (parseInt(b.min)||0))
}

function parseFifaLineup(data) {
  const root = data?.Results?.[0] ?? data
  const result = { home:[], away:[], homeCoach:'', awayCoach:'', homeFormation:'', awayFormation:'',
                   fifaHomeAbbr:'', fifaAwayAbbr:'' }
  for (const [side, td] of [['home', root?.HomeTeam], ['away', root?.AwayTeam]]) {
    if (!td) continue
    const hc = (td.Coaches || []).find(c => c.Role === 1) || td.Coaches?.[0]
    const abbr = (td.Abbreviation || td.TeamCode || '').toUpperCase()
    const allP = td.Players || []

    // FormationPlace 1-11 = starting XI regardless of current match status (subbed out players
    // change their Status mid-match but keep their FormationPlace)
    let starters = allP.filter(p => p.FormationPlace >= 1 && p.FormationPlace <= 11)
    // Fallback: Status 1=active, 2=subbed-out, 3=came-on — take active+subbed-out to get original XI
    if (starters.length < 8) starters = allP.filter(p => p.Status === 1 || p.Status === 2)
    // Last resort: any player, sorted by shirt number
    if (starters.length < 8) starters = [...allP].sort((a,b)=>(a.ShirtNumber||99)-(b.ShirtNumber||99))
    starters = starters.slice(0, 11)

    const players = starters.map(p => ({
      id: p.IdPlayer, name: p.ShortName?.[0]?.Description || p.PlayerName?.[0]?.Description || '',
      jersey: String(p.ShirtNumber ?? ''), pos: FIFA_POS_ABBR[p.Position] || 'M',
      photo: p.PlayerPicture?.PictureUrl || null, jerseyImg: null,
      formationPlace: p.FormationPlace || 99, rating: null,
    }))
    const bench = allP.filter(p => !starters.includes(p)).slice(0, 12).map(p => ({
      id: p.IdPlayer, name: p.ShortName?.[0]?.Description || p.PlayerName?.[0]?.Description || '',
      jersey: String(p.ShirtNumber ?? ''), pos: FIFA_POS_ABBR[p.Position] || 'M',
      photo: p.PlayerPicture?.PictureUrl || null, jerseyImg: null, formationPlace: 99, rating: null,
    }))
    if (side === 'home') { result.home = players; result.homeBench = bench; result.homeFormation = td.Tactics || ''; result.homeCoach = hc?.Name?.[0]?.Description || ''; result.fifaHomeAbbr = abbr }
    else                 { result.away = players; result.awayBench = bench; result.awayFormation = td.Tactics || ''; result.awayCoach = hc?.Name?.[0]?.Description || ''; result.fifaAwayAbbr = abbr }
  }
  return result
}

function parseFifaStats(fd) {
  const root = fd?.Results?.[0] ?? fd
  const parse = td => {
    if (!td) return null
    const s = td.Statistics || td.TeamStatistics || {}
    return {
      possession:    s.BallPossession  ?? s.Possession        ?? null,
      shots:         s.Attempts        ?? s.Shots              ?? null,
      shotsOnTarget: s.AttemptsOnGoal  ?? s.ShotsOnTarget      ?? null,
      saves:         s.GoalkeeperSaves ?? s.Saves              ?? null,
      passes:        s.Passes          ?? s.TotalPasses         ?? null,
      passAcc:       s.PassesAccuracy  ?? null,
      corners:       s.Corners         ?? null,
      fouls:         s.Fouls           ?? s.FoulsCommitted      ?? null,
      offsides:      s.Offsides        ?? null,
      yellows:       s.YellowCards     ?? null,
      reds:          s.RedCards        ?? null,
      tackles:       s.Tackles         ?? null,
    }
  }
  return { home: parse(root?.HomeTeam), away: parse(root?.AwayTeam) }
}

function parseEspnStats(summary) {
  const teams = summary?.boxscore?.teams || []
  if (!teams.length) return { home: null, away: null }
  const result = { home: null, away: null }
  const keyMap = {
    possessionPct:'possession', possession:'possession',
    totalShots:'shots', shotsTotal:'shots',
    shotsOnTarget:'shotsOnTarget', onTarget:'shotsOnTarget',
    saves:'saves', goalKeeperSaves:'saves',
    totalPasses:'passes', passes:'passes',
    cornerKicks:'corners', corners:'corners',
    foulsCommitted:'fouls', fouls:'fouls',
    offsides:'offsides',
    yellowCards:'yellows', redCards:'reds',
    tackles:'tackles',
  }
  for (const t of teams) {
    const side = t.homeAway === 'home' ? 'home' : 'away'
    const stats = {}
    for (const s of (t.statistics || [])) {
      const mapped = keyMap[s.name] || keyMap[s.abbreviation]
      if (!mapped) continue
      const v = parseFloat((s.displayValue || s.value || '').toString().replace('%',''))
      if (!isNaN(v)) stats[mapped] = v
    }
    result[side] = Object.keys(stats).length ? stats : null
  }
  return result
}

function parseEspnTimeline(summary) {
  // Get home/away team IDs — try header first, then boxscore
  const comp = summary?.header?.competitions?.[0]
  const hdComp = comp?.competitors || []
  const bsTeams = summary?.boxscore?.teams || []
  const getTeamId = (arr, hw) =>
    String(arr.find(c => c.homeAway === hw)?.team?.id || '')
  let homeId = getTeamId(hdComp, 'home') || getTeamId(bsTeams, 'home')
  let awayId = getTeamId(hdComp, 'away') || getTeamId(bsTeams, 'away')

  const parsePart = p => {
    const scorer = p.participants?.find(x => {
      const xt = String(x.type?.id||''); const xn = (x.type?.text||'').toLowerCase()
      return xt==='scorer'||xt==='1'||xn.includes('scorer')
    }) || p.participants?.[0]
    const player  = scorer?.athlete?.displayName || scorer?.athlete?.shortName || ''
    const jersey  = String(scorer?.athlete?.jersey || scorer?.athlete?.jerseyNumber || '')
    const teamId  = String(p.team?.id || '')
    const side    = homeId && teamId===homeId ? 'home' : awayId && teamId===awayId ? 'away' : ''
    const dv = p.clock?.displayValue, sv = p.clock?.value
    const min = dv ? String(parseInt(dv)||dv.split(':')[0]||'')
                   : typeof sv==='number' ? String(Math.floor(sv/60)) : ''
    return { player, jersey, teamId, side, min }
  }

  const out = []
  const seen = new Set()
  const dedup = p => { const k = p.id ?? `${p.clock?.value}|${p.team?.id}|${p.type?.id}`; if(seen.has(k))return false; seen.add(k); return true }

  // scoringPlays = always goals, regardless of type text
  for (const p of summary?.scoringPlays || []) {
    if (!dedup(p)) continue
    const { player, jersey, side, min } = parsePart(p)
    out.push({ min, type:'goal', player, jersey, playerOn:'', side })
  }

  // keyEvents and plays — filter by type
  for (const p of [...(summary?.keyEvents||[]), ...(summary?.plays||[])]) {
    if (!dedup(p)) continue
    const tt = String(p.type?.text||p.type?.name||'').toLowerCase()
    const ti = String(p.type?.id||'')
    const isGoal = tt.includes('goal')||tt.includes('penalty')||ti==='70'||ti==='72'||ti==='96'
    const isCard = tt.includes('yellow')||tt.includes('red card')||p.yellowCard||p.redCard||['93','94','95'].includes(ti)
    const isSub  = tt.includes('substitut')||ti==='73'
    if (!isGoal && !isCard && !isSub) continue
    const { player, jersey, side, min } = parsePart(p)
    const playerOn = isSub ? (p.participants?.find(x=>(x.type?.text||'').toLowerCase().includes('substitut'))?.athlete?.displayName||'') : ''
    const isRed = p.redCard||tt.includes('red card')||ti==='95'
    out.push({ min, type: isGoal?'goal': isSub?'sub': isRed?'red':'yellow', player, jersey, playerOn, side })
  }

  return out.sort((a,b)=>(parseInt(a.min)||0)-(parseInt(b.min)||0))
}

// ── Predictions ───────────────────────────────────────────────
function predictMatch(homeRank, awayRank) {
  if (!homeRank || !awayRank) return { home: 38, draw: 24, away: 38 }
  // Simple logistic model on FIFA ranking difference
  const diff = awayRank - homeRank  // positive = home is stronger
  const pWin = 1 / (1 + Math.pow(10, -diff / 50))
  const pDraw = 0.25
  const pHome = Math.round(pWin * (1 - pDraw) * 100)
  const pAway = Math.round((1 - pWin) * (1 - pDraw) * 100)
  const pD    = 100 - pHome - pAway
  return { home: Math.max(5, pHome), draw: Math.max(5, pD), away: Math.max(5, pAway) }
}

// ── Utilities ─────────────────────────────────────────────────
function EventIcon({ type }) {
  const t = (type || '').toLowerCase()
  if (t === 'goal')   return <span className="mx-evt-icon">⚽</span>
  if (t === 'yellow') return <span className="mx-evt-card yellow" />
  if (t === 'red')    return <span className="mx-evt-card red" />
  if (t === 'sub')    return <span className="mx-evt-icon" style={{fontSize:'.85em'}}>🔄</span>
  return <span>•</span>
}

function fmtLocalTime(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (isNaN(d)) return null
    return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', timeZone:'America/Los_Angeles' })
  } catch { return null }
}

function normName(n = '') {
  return n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z]/g,'')
}

function annotatePlayerEvents(players, events) {
  return players.map(p => {
    const pw = (p.name||'').split(/\s+/).map(normName).filter(w => w.length > 2)
    const mine = events.filter(e => {
      const ew = (e.player||'').split(/\s+/).map(normName).filter(w => w.length > 2)
      return ew.some(w => pw.includes(w))
    })
    return {
      ...p,
      goals:     mine.filter(e=>e.type==='goal').length,
      assists:   0,
      yellows:   mine.filter(e=>e.type==='yellow').length,
      reds:      mine.filter(e=>e.type==='red').length,
      subbedOff: mine.some(e=>e.type==='sub'),
    }
  })
}

function parseSofaLineupSide(side) {
  return (side?.players || []).map(sp => ({
    ssId:    sp.player?.id,
    name:    sp.player?.shortName || sp.player?.name || '',
    jersey:  String(sp.jerseyNumber ?? sp.player?.jerseyNumber ?? ''),
    photo:   sp.player?.id ? `https://api.sofascore.com/api/v1/player/${sp.player.id}/image` : null,
    rating:  sp.statistics?.rating ?? null,
    goals:   sp.statistics?.goals ?? 0,
    assists: sp.statistics?.goalAssist ?? 0,
    yellows: sp.statistics?.yellowCard ?? 0,
    reds:    (sp.statistics?.redCard ?? 0) + (sp.statistics?.directRedCard ?? 0),
  }))
}

function mergeWithSofa(fifaPlayers, ssPlayers) {
  if (!ssPlayers?.length) return fifaPlayers
  return fifaPlayers.map(p => {
    const jn = String(p.jersey || '')
    const ssP = ssPlayers.find(sp =>
      (jn && sp.jersey === jn) ||
      (normName(sp.name).slice(0, 5) === normName(p.name || '').slice(0, 5) && normName(p.name||'').length > 2)
    )
    if (!ssP) return p
    return {
      ...p,
      photo:   ssP.photo || p.photo,
      rating:  ssP.rating,
      goals:   Math.max(p.goals || 0, ssP.goals || 0),
      assists: ssP.assists || 0,
      yellows: Math.max(p.yellows || 0, ssP.yellows || 0),
      reds:    Math.max(p.reds || 0, ssP.reds || 0),
    }
  })
}

// ── Prediction bar ────────────────────────────────────────────
function PredictionBar({ home, draw, away, homeAbbr, awayAbbr }) {
  return (
    <div className="mx-pred">
      <div className="mx-pred-bar">
        <div className="mx-pred-seg home" style={{ width:`${home}%` }} />
        <div className="mx-pred-seg draw" style={{ width:`${draw}%` }} />
        <div className="mx-pred-seg away" style={{ width:`${away}%` }} />
      </div>
      <div className="mx-pred-labels">
        <span className="mx-pred-pct home">{home}%</span>
        <span className="mx-pred-pct draw">{draw}%</span>
        <span className="mx-pred-pct away">{away}%</span>
      </div>
    </div>
  )
}

// ── Pitch layout ──────────────────────────────────────────────
const POS_ROW = {G:3,GK:3,CD:2,CB:2,LB:2,RB:2,LWB:2,RWB:2,SW:2,D:2,WB:2,CM:1,DM:1,CDM:1,CAM:1,AM:1,LM:1,RM:1,M:1,LW:1,RW:1,WM:1,ST:0,CF:0,SS:0,FW:0,F:0,ATT:0,LF:0,RF:0}
function posRow(pos='') { return POS_ROW[pos.toUpperCase().split('-')[0]] ?? 1 }
const COL_X_HOME = [80,55,32,10]
const COL_X_AWAY = [20,45,68,90]

function PitchPlayer({ player, x, y }) {
  const [ps, setPs] = useState('headshot')
  const jerseyName = player.name ? player.name.split(/\s+/).slice(-1)[0] : player.jersey
  const src = ps === 'headshot' ? player.photo : ps === 'jersey' ? player.jerseyImg : null
  const hasEvts = (player.goals>0)||(player.yellows>0)||(player.reds>0)
  const rc = player.rating ? (+player.rating>=7.5?'r-great':+player.rating>=6.5?'r-ok':'r-bad') : null
  return (
    <div className="mx-pp" style={{left:`${x}%`,top:`${y}%`}}>
      <div className="mx-pp-photo">
        {src ? <img src={src} alt="" onError={()=>setPs(s=>s==='headshot'?'jersey':'none')} className="mx-pp-img" />
             : <span className="mx-pp-num-badge">{player.jersey}</span>}
        {hasEvts && (
          <div className="mx-pp-events">
            {Array.from({length:player.goals}).map((_,i)=><span key={`g${i}`} className="mx-pp-evt-ball">⚽</span>)}
            {player.yellows>0 && <span className="mx-pp-evt-card yellow" />}
            {player.reds>0    && <span className="mx-pp-evt-card red" />}
          </div>
        )}
      </div>
      <div className="mx-pp-label">
        <span className="mx-pp-num">#{player.jersey}</span>
        <span className="mx-pp-name">{jerseyName}</span>
        {player.rating && <span className={`mx-pp-rating ${rc}`}>{player.rating}</span>}
      </div>
    </div>
  )
}

function HalfPitch({ players, side='home', coach='' }) {
  const colX = side==='home' ? COL_X_HOME : COL_X_AWAY
  const cols = [[],[],[],[]]
  for (const p of players) cols[Math.min(posRow(p.pos),3)].push(p)
  const coachLastName = (coach||'').trim().split(/\s+/).slice(-1)[0]
  return (
    <div className={`mx-half-pitch ${side}`}>
      {cols.map((col,ci)=>col.map((p,i)=>{
        const n=col.length, x=colX[ci], y=n<=1?50:15+(i/(n-1))*70
        return <PitchPlayer key={p.id||`${ci}-${i}`} player={p} x={x} y={y} />
      }))}
      {coachLastName && (
        <div className={`mx-half-coach ${side}`}>
          <span>🧥</span>{coachLastName}
        </div>
      )}
    </div>
  )
}

// ── Vertical pitch (side panels during live games) ────────────
function assignToRows(players, formationStr) {
  // 'G' and 'GK' both mean goalkeeper across different data sources
  const gks = players.filter(p => p.pos === 'GK' || p.pos === 'G')
  // Sort outfield players by formationPlace (FIFA API: slot 1=GK, then DEF→MID→FWD in order)
  // so that splitting by formation string gives correct rows regardless of position label
  const out = [...players.filter(p => p.pos !== 'GK' && p.pos !== 'G')]
    .sort((a, b) => (a.formationPlace || 99) - (b.formationPlace || 99))

  const fStr = (formationStr || '').trim()
  // Handle both "4-3-3" / "4 3 3" (with separators) and "433" / "4231" (no separator) formats
  const fParts = /^\d+$/.test(fStr)
    ? fStr.split('').map(Number).filter(n => n > 0 && n <= 6)
    : fStr.split(/[-\s]+/).map(Number).filter(n => n > 0 && n <= 6)

  const rows = [gks]
  if (fParts.length && fParts.reduce((a, b) => a + b, 0) === out.length) {
    let idx = 0
    for (const n of fParts) { rows.push(out.slice(idx, idx + n)); idx += n }
  } else {
    // Fallback: group by broad position category
    const byR = {}
    for (const p of out) { const r = posRow(p.pos); (byR[r] = byR[r] || []).push(p) }
    for (const r of [2, 1, 0]) if (byR[r]?.length) rows.push(byR[r])
  }
  return rows
}

// Compute Y positions for BOTH teams together so their forward lines are always ≥8% apart.
// Home GK anchored at 94% (bottom), away GK at 6% (top). Both FWD lines stop at 54%/46%.
function rowYsPair(homeN, awayN) {
  const HOME_GK = 94, AWAY_GK = 6, HOME_FWD = 54, AWAY_FWD = 46
  const line = (start, end, n) =>
    n === 1 ? [start] : Array.from({length: n}, (_, i) => start + (i / (n - 1)) * (end - start))
  return {
    homeYs: line(HOME_GK, HOME_FWD, homeN),
    awayYs: line(AWAY_GK, AWAY_FWD, awayN),
  }
}

function VPlayer({ player, x, y, isHome, powerRatings }) {
  const [photoErr, setPhotoErr] = useState(false)
  const rating = player.ssId && powerRatings ? (powerRatings[player.ssId] ?? null) : null
  const hasGoal   = player.goals > 0
  const hasAssist = (player.assists || 0) > 0
  const hasCard   = player.yellows > 0 || player.reds > 0
  const photo = player.photo && !photoErr ? player.photo : null
  const name  = jerseyName(player.name)
  return (
    <div className="mx-vp" style={{left:`${x}%`,top:`${y}%`}}>
      <div className="mx-vp-badge-wrap">
        <div className={`mx-vp-badge ${isHome ? 'home' : 'away'}`}>
          {photo
            ? <img src={photo} alt="" className="mx-vp-photo" onError={() => setPhotoErr(true)} />
            : <span className="mx-vp-num">{player.jersey}</span>}
          {player.subbedOff && <span className="mx-vp-suboff">↓</span>}
        </div>
        {(hasGoal || hasAssist || hasCard) && (
          <div className="mx-vp-events">
            {Array.from({length:player.goals}).map((_,i)=>(
              <span key={i} className="mx-vp-evt-ball">⚽</span>
            ))}
            {hasAssist && <span className="mx-vp-evt-ball">🥾</span>}
            {player.yellows>0 && <span className="mx-vp-evt-ball">🟨</span>}
            {player.reds>0    && <span className="mx-vp-evt-ball">🟥</span>}
          </div>
        )}
      </div>
      <div className="mx-vp-label">
        <span className="mx-vp-lnum">#{player.jersey}</span>
        {name && <span className="mx-vp-lname">{name}</span>}
        {rating != null && <span className="mx-vp-rating">{rating.toFixed(2)}</span>}
      </div>
    </div>
  )
}

function VCoach({ name, y }) {
  const lastName = (name||'').trim().split(/\s+/).slice(-1)[0]
  if (!lastName) return null
  return (
    <div className="mx-vp-coach" style={{left:'50%', top:`${y}%`}}>
      <span className="mx-vp-coach-ic">🧥</span>
      <span className="mx-vp-coach-nm">{lastName}</span>
    </div>
  )
}

// Bench sub row — used in stats tab bench section
function BenchSubRow({ player, side }) {
  const [photoErr, setPhotoErr] = useState(false)
  const photo = player.photo && !photoErr ? player.photo : null
  const name = jerseyName(player.name)
  return (
    <div className={`mx-bsr ${side}`}>
      <div className="mx-bsr-av">
        {photo
          ? <img src={photo} alt="" className="mx-bsr-img" onError={() => setPhotoErr(true)} />
          : <span className="mx-bsr-jnum">{player.jersey}</span>}
      </div>
      <span className="mx-bsr-jn2">{player.jersey}</span>
      <span className="mx-bsr-nm">{name || `#${player.jersey}`}</span>
      <span className="mx-bsr-pos">{player.pos}</span>
    </div>
  )
}

// Bench column — vertical strip beside the pitch, top half = away bench, bottom half = home bench
function BenchColumn({ homeBench = [], awayBench = [] }) {
  if (!homeBench.length && !awayBench.length) return null
  return (
    <div className="mx-bench-col">
      <div className="mx-bench-section">
        {awayBench.slice(0, 7).map((p, i) => (
          <div key={p.id||`a${i}`} className="mx-bench-player away">
            <span className="mx-bench-jn">{p.jersey}</span>
            <span className="mx-bench-nm">{jerseyName(p.name)}</span>
          </div>
        ))}
      </div>
      <div className="mx-bench-sep" />
      <div className="mx-bench-section">
        {homeBench.slice(0, 7).map((p, i) => (
          <div key={p.id||`h${i}`} className="mx-bench-player home">
            <span className="mx-bench-jn">{p.jersey}</span>
            <span className="mx-bench-nm">{jerseyName(p.name)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Stats panel ───────────────────────────────────────────────
const STAT_ROWS = [
  { key:'possession', label:'Possession', fmt: v=>`${Math.round(v)}%` },
  { key:'shots',          label:'Shots' },
  { key:'shotsOnTarget',  label:'On Target' },
  { key:'saves',          label:'Saves' },
  { key:'passes',         label:'Passes' },
  { key:'corners',        label:'Corners' },
  { key:'fouls',          label:'Fouls' },
  { key:'offsides',       label:'Offsides' },
  { key:'tackles',        label:'Tackles' },
  { key:'yellows',        label:'Yellows' },
]

function StatsPanel({ stats, homeAbbr, awayAbbr }) {
  const h = stats?.home, a = stats?.away
  if (!h && !a) return (
    <div className="mx-stats-panel"><div className="mx-stats-pending">Stats loading…</div></div>
  )
  return (
    <div className="mx-stats-panel">
      <div className="mx-stats-teams">
        <span className="mx-stats-tnm home">{homeAbbr}</span>
        <span className="mx-stats-tnm away">{awayAbbr}</span>
      </div>
      {STAT_ROWS.map(({ key, label, fmt }) => {
        const hv = h?.[key], av = a?.[key]
        if (hv == null && av == null) return null
        const hVal = hv ?? 0, aVal = av ?? 0
        const total = hVal + aVal || 1
        const hPct = (hVal / total) * 100
        const aPct = (aVal / total) * 100
        const fmtV = fmt ?? (v => Math.round(v))
        return (
          <div key={key} className="mx-stat-row">
            <span className="mx-stat-val home">{hv != null ? fmtV(hv) : '—'}</span>
            <div className="mx-stat-mid">
              <div className="mx-stat-label">{label}</div>
              <div className="mx-stat-bar">
                <div className="mx-stat-seg home" style={{width:`${hPct}%`}} />
                <div className="mx-stat-seg away" style={{width:`${aPct}%`}} />
              </div>
            </div>
            <span className="mx-stat-val away">{av != null ? fmtV(av) : '—'}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Roster (separate from pitch) ──────────────────────────────
const jerseyName = n => (n || '').trim().split(/\s+/).slice(-1)[0] || n || ''
const evtLabel = e => {
  const nm = e.player || e.name || ''
  return nm ? jerseyName(nm) : (e.jersey ? `#${e.jersey}` : '')
}

function RosterRow({ player }) {
  const [photoErr, setPhotoErr] = useState(false)
  const rc = player.rating
    ? +player.rating >= 8 ? 'great' : +player.rating >= 7 ? 'good' : +player.rating >= 6 ? 'ok' : 'bad'
    : null
  const displayName = jerseyName(player.name) || `#${player.jersey}`
  return (
    <div className={`mx-rr${player.subbedOff ? ' off' : ''}`}>
      <span className="mx-rr-jn">{player.jersey}</span>
      <div className="mx-rr-av">
        {player.photo && !photoErr
          ? <img src={player.photo} alt="" className="mx-rr-img" onError={() => setPhotoErr(true)} />
          : <span className="mx-rr-init">{displayName[0]?.toUpperCase()}</span>}
      </div>
      <span className="mx-rr-nm">{displayName}</span>
      <div className="mx-rr-evts">
        {Array.from({ length: player.goals || 0 }).map((_, i) => (
          <span key={i} className="mx-rr-ball">⚽</span>
        ))}
        {(player.assists || 0) > 0 && <span className="mx-rr-boot">🥾</span>}
        {(player.yellows || 0) > 0 && <span className="mx-pp-evt-card yellow" style={{ flexShrink: 0 }} />}
        {(player.reds || 0) > 0 && <span className="mx-pp-evt-card red" style={{ flexShrink: 0 }} />}
      </div>
      {rc && <span className={`mx-rr-rat ${rc}`}>{(+player.rating).toFixed(1)}</span>}
    </div>
  )
}

function RosterList({ home, away, homeAbbr, awayAbbr }) {
  return (
    <div className="mx-roster">
      <div className="mx-roster-cols">
        <div className="mx-roster-col">
          <div className="mx-roster-thdr">{homeAbbr}</div>
          {home.map((p, i) => <RosterRow key={p.id || `h${i}`} player={p} />)}
        </div>
        <div className="mx-roster-partition" />
        <div className="mx-roster-col">
          <div className="mx-roster-thdr">{awayAbbr}</div>
          {away.map((p, i) => <RosterRow key={p.id || `a${i}`} player={p} />)}
        </div>
      </div>
    </div>
  )
}

function resolveEvtName(e, players) {
  const raw = e.player || e.name || ''
  if (raw) return jerseyName(raw)
  if (e.jersey) {
    const byJersey = players.find(p => String(p.jersey) === String(e.jersey))
    if (byJersey?.name) return jerseyName(byJersey.name)
  }
  if (e.player) {
    const ew = e.player.split(/\s+/).map(normName).filter(w => w.length > 2)
    const hit = players.find(p => {
      const pw = (p.name||'').split(/\s+/).map(normName).filter(w => w.length > 2)
      return ew.some(w => pw.includes(w))
    })
    if (hit?.name) return jerseyName(hit.name)
  }
  return ''
}

function LiveSidePanel({ liveMatch, timeline, lineup, sofaPlayers, stats, powerRatings, panelSide }) {
  const atHT = liveMatch?.isHT


  if (!liveMatch) return <div className="mx-live-panel-slot mx-lsp-empty" />

  const homeEvts = timeline.filter(e=>e.side==='home')
  const awayEvts = timeline.filter(e=>e.side==='away')
  const subEvts  = timeline.filter(e=>e.type==='sub')
  const homePlayers = mergeWithSofa(annotatePlayerEvents(lineup?.home||[], homeEvts), sofaPlayers?.home)
  const awayPlayers = mergeWithSofa(annotatePlayerEvents(lineup?.away||[], awayEvts), sofaPlayers?.away)
  const homeBench = mergeWithSofa(lineup?.homeBench||[], sofaPlayers?.home)
  const awayBench = mergeWithSofa(lineup?.awayBench||[], sofaPlayers?.away)

  const homeRows = assignToRows(homePlayers, lineup?.homeFormation)
  const awayRows = assignToRows(awayPlayers, lineup?.awayFormation)
  const { homeYs, awayYs } = rowYsPair(homeRows.length, awayRows.length)
  // Tighter spread for small groups (CDMs), wider for large rows (back 4)
  const spreadX = (i, n) => {
    if (n <= 1) return 50
    const pad = n <= 2 ? 28 : n <= 3 ? 20 : n <= 4 ? 14 : n <= 5 ? 10 : 8
    return pad + (i / (n - 1)) * (100 - 2 * pad)
  }

  const { homeAbbr, awayAbbr, homeScore, awayScore, clock, isHT, date } = liveMatch
  const isFT = clock === 'FT'
  const kickoffTime = date ? fmtLocalTime(date) : null
  return (
    <div className="mx-live-panel-slot">
      {/* Side-by-side: pitch column (with header) | stats column */}
      <div className="mx-lsp-body">

        {/* Left: header + facts + pitch stacked */}
        <div className="mx-lsp-pitch-col">
          <div className="mx-lsp-hdr">
            <div className="mx-lsp-team">
              <img src={flagUrl(homeAbbr)} alt="" className="mx-lsp-flag" onError={e=>{e.target.style.display='none'}} />
              <span className="mx-lsp-abbr">{homeAbbr}</span>
              {homeEvts.filter(e=>e.type==='goal'||e.type==='yellow'||e.type==='red').length>0 && (
                <div className="mx-lsp-facts home">
                  {homeEvts.filter(e=>e.type==='goal'||e.type==='yellow'||e.type==='red').map((e,i)=>{
                    const nm = resolveEvtName(e, homePlayers)
                    return (
                      <span key={i} className="mx-fact-line">
                        <EventIcon type={e.type} />
                        {e.min && <span className="mx-fact-min">{e.min}'</span>}
                        {nm && <span className="mx-fact-nm">{nm}</span>}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="mx-lsp-mid">
              {!isHT && clock && (
                <div className="mx-lsp-clock-wrap">
                  <div className="mx-lsp-hbar left" />
                  <span className={`mx-lsp-clock${isFT?' ft':''}`}>{clock}</span>
                  <div className="mx-lsp-hbar right" />
                </div>
              )}
              {kickoffTime && <span className="mx-lsp-kickoff">{kickoffTime}</span>}
              <span className="mx-lsp-score">{homeScore}–{awayScore}</span>
              {liveMatch?.penScore && <span className="mx-pen-score">({liveMatch.penScore[0]}–{liveMatch.penScore[1]}) PEN</span>}
              {isHT && <span className="mx-lsp-ht-badge">HALF TIME</span>}
            </div>
            <div className="mx-lsp-team away">
              {awayEvts.filter(e=>e.type==='goal'||e.type==='yellow'||e.type==='red').length>0 && (
                <div className="mx-lsp-facts away">
                  {awayEvts.filter(e=>e.type==='goal'||e.type==='yellow'||e.type==='red').map((e,i)=>{
                    const nm = resolveEvtName(e, awayPlayers)
                    return (
                      <span key={i} className="mx-fact-line">
                        {nm && <span className="mx-fact-nm">{nm}</span>}
                        {e.min && <span className="mx-fact-min">{e.min}'</span>}
                        <EventIcon type={e.type} />
                      </span>
                    )
                  })}
                </div>
              )}
              <span className="mx-lsp-abbr">{awayAbbr}</span>
              <img src={flagUrl(awayAbbr)} alt="" className="mx-lsp-flag" onError={e=>{e.target.style.display='none'}} />
            </div>
          </div>

          <div className="mx-vpitch">
          <div className="mx-vp-corner-label" style={{top:'1%',left:'1%'}}>
            <div className="mx-vp-tlabel">
              <img src={flagUrl(awayAbbr)} alt="" className="mx-lsp-flag sm" onError={e=>{e.target.style.display='none'}} />
              <span>{awayAbbr}</span>
              {lineup?.awayFormation && <span className="mx-vp-fmtn">{lineup.awayFormation}</span>}
            </div>
            {lineup?.awayCoach && <div className="mx-vp-coach-tag">🧥 {lineup.awayCoach.trim().split(/\s+/).slice(-1)[0]}</div>}
          </div>
          <div className="mx-vp-corner-label" style={{bottom:'1%',left:'1%'}}>
            <div className="mx-vp-tlabel">
              <img src={flagUrl(homeAbbr)} alt="" className="mx-lsp-flag sm" onError={e=>{e.target.style.display='none'}} />
              <span>{homeAbbr}</span>
              {lineup?.homeFormation && <span className="mx-vp-fmtn">{lineup.homeFormation}</span>}
            </div>
            {lineup?.homeCoach && <div className="mx-vp-coach-tag">🧥 {lineup.homeCoach.trim().split(/\s+/).slice(-1)[0]}</div>}
          </div>
          <div className="mx-vp-half" />
          <div className="mx-vp-dot" />
          {awayRows.map((row,ri)=>row.map((p,pi)=>(
            <VPlayer key={`a${p.id||`${ri}-${pi}`}`} player={p} x={spreadX(pi,row.length)} y={awayYs[ri]} isHome={false} powerRatings={powerRatings} />
          )))}
          {homeRows.map((row,ri)=>row.map((p,pi)=>(
            <VPlayer key={`h${p.id||`${ri}-${pi}`}`} player={p} x={spreadX(pi,row.length)} y={homeYs[ri]} isHome={true} powerRatings={powerRatings} />
          )))}
          {!homePlayers.length && !awayPlayers.length && (
            <span className="mx-vp-pending">⏱ Lineup pending</span>
          )}
          </div>{/* end mx-vpitch */}
        </div>{/* end mx-lsp-pitch-col */}

        {/* Stats panel alongside pitch */}
        <div className="mx-lsp-stats-side">
          <div className="mx-lsp-stats-hdr">MATCH STATS</div>
          <StatsPanel stats={stats} homeAbbr={homeAbbr} awayAbbr={awayAbbr} />
          {(homeBench.length || awayBench.length) && (
            <>
              <div className="mx-lsp-stats-hdr" style={{borderTop:'1px solid rgba(255,255,255,.08)'}}>SUBSTITUTES</div>
              <div className="mx-bench-row">
                <div className="mx-bench-half home">
                  <div className="mx-bench-rhdr">{homeAbbr}</div>
                  {homeBench.slice(0,7).map((p,i)=>(
                    <BenchSubRow key={p.id||`h${i}`} player={p} side="home" />
                  ))}
                </div>
                <div className="mx-bench-half away">
                  <div className="mx-bench-rhdr">{awayAbbr}</div>
                  {awayBench.slice(0,7).map((p,i)=>(
                    <BenchSubRow key={p.id||`a${i}`} player={p} side="away" />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

      </div>{/* end mx-lsp-body */}
    </div>
  )
}

// ── Live match tile ───────────────────────────────────────────
function LiveMatchTile({ event, timeline, lineup }) {
  const { homeAbbr, awayAbbr, homeScore, awayScore, clock, isHT } = event
  const homeEvts = timeline.filter(e=>e.side==='home')
  const awayEvts = timeline.filter(e=>e.side==='away')
  const homePlayers = annotatePlayerEvents(lineup?.home||[], homeEvts)
  const awayPlayers = annotatePlayerEvents(lineup?.away||[], awayEvts)
  return (
    <div className="mx-live-tile">
      <div className="mx-live-hdr">
        <span className="mx-live-badge"><span className="mx-live-dot" />LIVE</span>
        <div className="mx-live-scorebar">
          <img src={flagUrl(homeAbbr)} alt={homeAbbr} className="mx-sb-flag" onError={e=>{e.target.style.display='none'}} />
          <span className="mx-sb-abbr">{homeAbbr}</span>
          <span className={`mx-sb-score${homeScore>awayScore?' lead':''}`}>{homeScore}</span>
          <span className="mx-sb-sep">{isHT?'HT':clock}</span>
          <span className={`mx-sb-score${awayScore>homeScore?' lead':''}`}>{awayScore}</span>
          <span className="mx-sb-abbr">{awayAbbr}</span>
          <img src={flagUrl(awayAbbr)} alt={awayAbbr} className="mx-sb-flag" onError={e=>{e.target.style.display='none'}} />
        </div>
      </div>
      <div className="mx-live-squads">
        <div className="mx-live-side">
          <div className="mx-live-side-hdr">
            <img src={flagUrl(homeAbbr)} alt="" className="mx-side-flag" onError={e=>{e.target.style.display='none'}} />
            <span className="mx-side-abbr">{homeAbbr}</span>
            {lineup?.homeFormation && <span className="mx-side-fmtn">{lineup.homeFormation}</span>}
          </div>
          {/* Events directly under team header */}
          {homeEvts.filter(e=>e.type!=='sub').length > 0 && (
            <div className="mx-tile-evts home">
              {homeEvts.filter(e=>e.type!=='sub').map((e,i)=>(
                <span key={i} className="mx-tile-evt">
                  {evtLabel(e) && <span className="mx-tile-nm">{evtLabel(e)}</span>}
                  <EventIcon type={e.type}/>
                  {e.min && <span className="mx-tile-min">{e.min}'</span>}
                </span>
              ))}
            </div>
          )}
          {homePlayers.length>0
            ? <HalfPitch players={homePlayers} coach={lineup?.homeCoach||''} />
            : <div className="mx-no-lineup">
                <span className="mx-no-lineup-msg">⏱ Lineup pending</span>
              </div>}
        </div>
        <div className="mx-live-divider" />
        <div className="mx-live-side">
          <div className="mx-live-side-hdr right">
            {lineup?.awayFormation && <span className="mx-side-fmtn">{lineup.awayFormation}</span>}
            <span className="mx-side-abbr">{awayAbbr}</span>
            <img src={flagUrl(awayAbbr)} alt="" className="mx-side-flag" onError={e=>{e.target.style.display='none'}} />
          </div>
          {/* Events directly under team header */}
          {awayEvts.filter(e=>e.type!=='sub').length > 0 && (
            <div className="mx-tile-evts away">
              {awayEvts.filter(e=>e.type!=='sub').map((e,i)=>(
                <span key={i} className="mx-tile-evt">
                  {e.min && <span className="mx-tile-min">{e.min}'</span>}
                  <EventIcon type={e.type}/>
                  {evtLabel(e) && <span className="mx-tile-nm">{evtLabel(e)}</span>}
                </span>
              ))}
            </div>
          )}
          {awayPlayers.length>0
            ? <HalfPitch players={awayPlayers} side="away" coach={lineup?.awayCoach||''} />
            : <div className="mx-no-lineup">
                <span className="mx-no-lineup-msg">⏱ Lineup pending</span>
              </div>}
        </div>
      </div>
    </div>
  )
}

// ── Match row ─────────────────────────────────────────────────
// dayOffset: -1=prev, 0=current, 1=future
function MatchRow({ m, showDetails, dayOffset, fifaInfo, statusMap, timelines, rankings }) {
  const ft  = m.score?.ft
  const et  = m.score?.et
  const pen = m.score?.p || fifaInfo?.penScore || null
  const state = fifaInfo?.state
  const displayScore = et || ft || (state==='post' ? fifaInfo?.postScore : null)
  const [ds1,ds2] = displayScore || []
  const played = !!displayScore
  const isLive = !played && state==='in'

  const win1 = played && (pen ? pen[0]>pen[1] : ds1>ds2)
  const win2 = played && (pen ? pen[1]>pen[0] : ds2>ds1)
  const lose1 = played && win2
  const lose2 = played && win1
  const url1 = flagUrl(m.team1), url2 = flagUrl(m.team2)
  const localTime = fifaInfo?.date ? fmtLocalTime(fifaInfo.date) : null
  const venue = fifaInfo?.venue || null
  const mk = fifaInfo?.mk

  // All notable events (goals + cards) for each side
  const isFactEvt = e => ['goal','owngoal','yellow','red'].includes(e.type)
  const timeline = showDetails && (played||isLive) ? (timelines?.[mk]||[]) : []
  const homeEvts = timeline.filter(e=>e.side==='home' && isFactEvt(e))
  const awayEvts = timeline.filter(e=>e.side==='away' && isFactEvt(e))
  const noSideGoals = timeline.filter(e=>!e.side && (e.type==='goal'||e.type==='owngoal'))

  const toGoalEvt = (g, side) => ({ side, type: g.owngoal ? 'owngoal' : 'goal', name: g.name, min: g.minute })
  const opfbHome = played ? (m.goals1||[]).map(g=>toGoalEvt(g,'home')) : []
  const opfbAway = played ? (m.goals2||[]).map(g=>toGoalEvt(g,'away')) : []

  const homeDisplay = isLive
    ? (homeEvts.length>0 ? homeEvts : noSideGoals.slice(0, Math.ceil(noSideGoals.length/2)))
    : opfbHome.length>0 ? opfbHome
    : homeEvts.length>0 ? homeEvts
    : noSideGoals.slice(0, Math.ceil(noSideGoals.length/2))
  const awayDisplay = isLive
    ? (awayEvts.length>0 ? awayEvts : noSideGoals.slice(Math.ceil(noSideGoals.length/2)))
    : opfbAway.length>0 ? opfbAway
    : awayEvts.length>0 ? awayEvts
    : noSideGoals.slice(Math.ceil(noSideGoals.length/2))

  const hasEvts = homeDisplay.length>0 || awayDisplay.length>0

  // Match result label
  const resultLabel = pen ? 'PEN' : et ? 'AET' : played ? 'FT' : null

  // Prediction for upcoming games
  const pred = (!played && !isLive && dayOffset >= 0 && rankings)
    ? predictMatch(rankings[ab(m.team1)], rankings[ab(m.team2)])
    : null

  // Half-time / extra-time detection
  const isHT = isLive && (fifaInfo?.isHT || String(fifaInfo?.clock||'').trim().toUpperCase() === 'HT')
  const isET = isLive && !isHT && /^\d{9,}|^(?:1[0-9]{2}|9\d)/.test(String(fifaInfo?.clock||''))
  const clockRaw = fifaInfo?.clock || ''
  const clockLabel = !isLive ? null : isHT ? 'HT' : clockRaw || null
  const statusLabel = isHT ? 'HALF TIME' : isET ? 'EXTRA TIME' : isLive ? 'LIVE' : null

  return (
    <div className={`mx-row${played?' played':''}${isLive?' live':''}`}>

      {/* ── Row 1: live status bar (top, live games only) ── */}
      {isLive && (
        <>
          {clockLabel && (
            <div className="mx-live-clock-row">
              <span className="mx-live-clock-lbl">{clockLabel}</span>
            </div>
          )}
          <div className="mx-live-tag-row">
            <div className="mx-live-green-dot" />
            <span className={`mx-live-status-lbl${isHT?' ht':''}`}>{statusLabel}</span>
          </div>
          <div className="mx-live-bar">
            <div className="mx-live-slider" />
          </div>
        </>
      )}

      {/* ── Row 2: Home | Score/VS | Away ── */}
      <div className="mx-team-cell left">
        {url1 && <img src={url1} alt={ab(m.team1)} className="mx-flag" onError={e=>{e.target.style.display='none'}} />}
        <span className={`mx-name${win1?' win':lose1?' lose':!played&&!isLive?' pre':''} st-${statusMap?.[m.team1]||'tbd'}`}>{ab(m.team1)}</span>
        {homeDisplay.length>0 && (
          <div className="mx-facts-inline home">
            {homeDisplay.map((e,i)=>(
              <span key={i} className="mx-fact-line">
                <EventIcon type={e.type} />
                {e.min && <span className="mx-fact-min">{e.min}'</span>}
                {evtLabel(e) && <span className="mx-fact-nm">{evtLabel(e)}</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mx-center">
        {played ? (
          <>
            <span className="mx-result-lbl">{resultLabel}</span>
            <span className="mx-score">{ds1}–{ds2}</span>
            {pen && <span className="mx-pen-score">({pen[0]}–{pen[1]}) PEN</span>}
            {localTime && <span className="mx-match-time">{localTime}</span>}
          </>
        ) : isLive && fifaInfo?.liveScore ? (
          <>
            <span className="mx-score mx-score-live">{fifaInfo.liveScore[0]}–{fifaInfo.liveScore[1]}</span>
            {localTime && <span className="mx-match-time">{localTime}</span>}
          </>
        ) : (
          <>
            {localTime && <span className="mx-match-time">{localTime}</span>}
            <span className="mx-vs">vs</span>
          </>
        )}
      </div>

      <div className="mx-team-cell right">
        {awayDisplay.length>0 && (
          <div className="mx-facts-inline away">
            {awayDisplay.map((e,i)=>(
              <span key={i} className="mx-fact-line">
                {evtLabel(e) && <span className="mx-fact-nm">{evtLabel(e)}</span>}
                {e.min && <span className="mx-fact-min">{e.min}'</span>}
                <EventIcon type={e.type} />
              </span>
            ))}
          </div>
        )}
        <span className={`mx-name${win2?' win':lose2?' lose':!played&&!isLive?' pre':''} st-${statusMap?.[m.team2]||'tbd'}`}>{ab(m.team2)}</span>
        {url2 && <img src={url2} alt={ab(m.team2)} className="mx-flag" onError={e=>{e.target.style.display='none'}} />}
      </div>

      {/* ── Pred bar above venue ── */}
      {pred && (
        <div className="mx-pred-row"><PredictionBar {...pred} /></div>
      )}

      {/* ── Venue at bottom, two lines ── */}
      {venue && (()=>{
        const {stadium, cityLine} = splitVenue(venue)
        return (
          <div className="mx-venue-row">
            {stadium && <span className="mx-venue-line">{stadium}</span>}
            {cityLine && <span className="mx-venue-city">{cityLine}</span>}
          </div>
        )
      })()}

    </div>
  )
}

function ordinal(n) {
  if ([11,12,13].includes(n%100)) return `${n}th`
  if (n%10===1) return `${n}st`; if (n%10===2) return `${n}nd`; if (n%10===3) return `${n}rd`
  return `${n}th`
}

// ── Matchday block ────────────────────────────────────────────
function RoundBlock({ roundName, ms, highlight, dayOffset, showDetails, fifaMap, statusMap, timelines, rankings, resolveTeam }) {
  const getFifaInfo = (m) => {
    const direct = fifaMap?.[abKey(m.team1, m.team2)]
    if (direct || !resolveTeam) return direct || null
    const r1 = resolveTeam(m.team1), r2 = resolveTeam(m.team2)
    return (r1 && r2) ? fifaMap?.[abKey(r1, r2)] : null
  }
  const sorted = useMemo(()=>
    [...ms].sort((a,b)=>{
      const ta = getFifaInfo(a)?.date||''
      const tb = getFifaInfo(b)?.date||''
      return ta<tb?-1:ta>tb?1:0
    }),
  [ms,fifaMap,resolveTeam])
  const played = sorted.filter(m=>m.score?.ft).length
  let roundDateStr = null
  for (const m of sorted) {
    const fi = getFifaInfo(m)
    if (fi?.date) {
      try {
        const d = new Date(fi.date)
        const month = new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'America/Los_Angeles'}).format(d)
        const day   = parseInt(new Intl.DateTimeFormat('en-US',{day:'numeric',timeZone:'America/Los_Angeles'}).format(d))
        roundDateStr = `${month} ${ordinal(day)}`
      } catch {}
      break
    }
  }
  return (
    <div className={`mx-block${highlight?' current':''}`}>
      <div className="mx-block-hdr">
        <span className="mx-rnd-name">{roundName}</span>
      </div>
      {roundDateStr && <div className="mx-rnd-date">{roundDateStr}</div>}
      <div className="mx-block-matches">
        {sorted.map((m,i)=>(
          <MatchRow
            key={i} m={m}
            showDetails={showDetails}
            dayOffset={dayOffset}
            fifaInfo={getFifaInfo(m)}
            statusMap={statusMap}
            timelines={timelines}
            rankings={rankings}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────
function roundNum(r) {
  const s = (r || '').toLowerCase()
  if (s.includes('final') && !s.includes('semi') && !s.includes('quarter')) return 300
  if (s.includes('semi')) return 280
  if (s.includes('quarter')) return 260
  if (s.includes('16')) return 240
  if (s.includes('32')) return 220
  const m = r?.match(/\d+/)
  return m ? +m[0] : 999
}

export default function Matches({ matches, groups, onLiveChange }) {
  const [fifaMap,      setFifaMap]      = useState({})
  const [liveMatches,  setLiveMatches]  = useState([])
  const [timelines,    setTimelines]    = useState({})
  const [lineups,      setLineups]      = useState({})
  const [statsMap,     setStatsMap]     = useState({})
  const [rankings,      setRankings]      = useState(RANKINGS_FALLBACK)
  const [powerRatings,  setPowerRatings]  = useState({})
  const [currentLiveIdx, setCurrentLiveIdx] = useState(0)
  const [sidePanelMode,  setSidePanelMode]  = useState(false)
  const [sidePanelMks,   setSidePanelMks]   = useState([null, null])
  const [sofaData,       setSofaData]       = useState({})
  const fetchedKeys  = useRef(new Set())
  const knownEspnIds = useRef({})   // persistent key→espnId across ticks & page-loads aren't needed; accumulates within session

  // Cycle live games every 20s (single-game bottom-tile only)
  useEffect(() => {
    if (liveMatches.length<=1) return
    const t = setInterval(()=>setCurrentLiveIdx(i=>(i+1)%liveMatches.length), 20_000)
    return () => clearInterval(t)
  }, [liveMatches.length])
  useEffect(() => { setCurrentLiveIdx(0) }, [liveMatches.length])

  // Side-panel mode: enter with 1+ live game, exit only when ALL finish
  // sidePanelMks remembers which 2 games are pinned so they stay visible after FT
  useEffect(() => {
    if (liveMatches.length >= 1) {
      setSidePanelMode(true)
      setSidePanelMks(prev => {
        // Only replace a slot if it's empty or that game is now gone from liveMatches
        const live0 = liveMatches[0], live1 = liveMatches[1]
        const keep0 = prev[0] && liveMatches.find(m=>m.mk===prev[0]) ? prev[0] : live0?.mk||null
        const keep1 = prev[1] && liveMatches.find(m=>m.mk===prev[1]) ? prev[1] : live1?.mk||null
        return [keep0, keep1]
      })
    } else if (liveMatches.length === 0) {
      setSidePanelMode(false)
      setSidePanelMks([null, null])
    }
  }, [liveMatches.length])

  // Fetch FIFA rankings (rarely changes — hourly is fine)
  useEffect(() => {
    const loadRankings = async () => {
      try {
        const d = await fetch(FIFA_RANKINGS).then(r=>r.json())
        const map = {}
        for (const r of d.Rankings || []) {
          const abbr = r.Team?.Abbreviation?.toUpperCase()
          if (abbr) map[abbr] = r.RankingPosition
        }
        if (Object.keys(map).length > 10) setRankings(map)
      } catch {}
    }
    loadRankings()
    const iv = setInterval(loadRankings, 60 * 60_000)
    return () => clearInterval(iv)
  }, [])

  // Fetch SofaScore power ratings (by player SS id → rating)
  useEffect(() => {
    const loadPower = async () => {
      try {
        const d = await fetch(SS_POWER_URL).then(r => r.json())
        const map = {}
        for (const item of d.topPlayers?.rating || []) {
          const id = item.player?.id
          const rating = item.statistics?.rating
          if (id && rating) map[id] = +Number(rating).toFixed(2)
        }
        if (Object.keys(map).length > 5) setPowerRatings(map)
      } catch {}
    }
    loadPower()
    const iv = setInterval(loadPower, 10 * 60_000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const ptDate = (offset=0) => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'})
      .format(new Date(Date.now()+offset*86400000)).replace(/-/g,'')

    const load = async () => {
      if (DEMO) {
        setLiveMatches(MOCK_LIVE_MATCHES)
        setTimelines(MOCK_TIMELINES)
        setLineups(MOCK_LINEUPS)
        setSofaData(MOCK_SOFA_DATA)
        setFifaMap(prev => ({ ...prev, ...MOCK_FIFA_MAP }))
        return
      }

      const newMap = {}        // key → match metadata
      const espnIds = knownEspnIds.current  // persistent across ticks; starts empty, grows each tick
      const newTimelines = {}
      const newLineups   = {}

      // ── FIFA + ESPN in parallel ──────────────────────────────
      // Fetch 8 days back so older completed matches get ESPN IDs indexed on first load.
      // knownEspnIds persists these IDs across the 30s polling ticks.
      const espnDays = [-7,-6,-5,-4,-3,-2,-1,0,1].map(d => `${ESPN_BOARD}?dates=${ptDate(d)}`)
      const [fifaResult, espnResult] = await Promise.allSettled([
        fetch(FIFA_CALENDAR).then(r=>r.json()),
        Promise.allSettled(espnDays.map(url => fetch(url).then(r=>r.json()))),
      ])

      // Build base from ESPN (secondary)
      // eventsFromBoard: key → parsed events array (from scoreboard details — no extra API call)
      const eventsFromBoard = {}
      if (espnResult.status==='fulfilled') {
        const espnEvts = espnResult.value.flatMap(r=>r.status==='fulfilled' ? (r.value?.events||[]) : [])
        for (const ev of espnEvts) {
          const comp = ev.competitions?.[0]
          const h = comp?.competitors?.find(c=>c.homeAway==='home')
          const a = comp?.competitors?.find(c=>c.homeAway==='away')
          const hA = h?.team?.abbreviation?.toUpperCase()
          const aA = a?.team?.abbreviation?.toUpperCase()
          if (!hA||!aA) continue
          const key   = rawAbKey(hA,aA)
          const state = ev.status?.type?.state   // 'pre'|'in'|'post'
          const sc    = [parseInt(h.score??'0'), parseInt(a.score??'0')]
          espnIds[key] = ev.id
          newMap[key]  = {
            mk: `espn:${ev.id}`, date: ev.date,
            venue: appendState([comp.venue?.fullName||comp.venue?.shortName, comp.venue?.address?.city||comp.venue?.city].filter(Boolean).join(', ')),
            state, clock: ev.status?.displayClock||'',
            isHT: ['halftime','half-time','half time'].includes((ev.status?.type?.name||'').toLowerCase())
                  || (ev.status?.displayClock||'').toUpperCase() === 'HT',
            liveScore:  state==='in'   ? sc : null,
            postScore:  state==='post' ? sc : null,
            homeAbbr: hA, awayAbbr: aA,
          }
          // Parse events from scoreboard details — available for completed & in-progress matches
          const hId = String(h?.team?.id || '')
          const aId = String(a?.team?.id || '')
          const details = comp?.details || []
          if (details.length && (state === 'post' || state === 'in')) {
            const parsed = []
            const seenD = new Set()
            for (const d of details) {
              const dedup = `${d.clock?.value}|${d.type?.id}|${d.participants?.[0]?.athlete?.id}`
              if (seenD.has(dedup)) continue; seenD.add(dedup)
              const tt = String(d.type?.text || d.type?.name || '').toLowerCase()
              const ti = String(d.type?.id || '')
              const isGoal = tt.includes('goal') || ti === '70' || ti === '72' || tt === 'score'
              const isCard = tt.includes('yellow') || tt.includes('red card') || d.yellowCard || d.redCard || ['93','94','95'].includes(ti)
              const isSub  = tt.includes('substitut') || ti === '73'
              if (!isGoal && !isCard && !isSub) continue
              const dv = d.clock?.displayValue, sv = d.clock?.value
              const min = dv ? String(parseInt(dv) || dv.split(':')[0] || '')
                            : typeof sv === 'number' ? String(Math.floor(sv / 60)) : ''
              const scorerP = d.participants?.find(x => {
                const xt = String(x.type?.id||''); const xn = (x.type?.text||'').toLowerCase()
                return xt==='scorer'||xt==='1'||xn.includes('scorer')
              }) || d.participants?.[0]
              const player = scorerP?.athlete?.displayName || ''
              const jersey = String(scorerP?.athlete?.jersey || scorerP?.athlete?.jerseyNumber || '')
              const playerOn = isSub ? (d.participants?.find(x=>(x.type?.text||'').toLowerCase().includes('substitut'))?.athlete?.displayName || '') : ''
              const tid = String(d.team?.id || '')
              const side = tid === hId ? 'home' : tid === aId ? 'away' : ''
              const isRed = d.redCard || tt.includes('red card') || ti === '95'
              parsed.push({ min, type: isGoal ? 'goal' : isSub ? 'sub' : isRed ? 'red' : 'yellow', player, jersey, playerOn, side })
            }
            if (parsed.length) {
              eventsFromBoard[key] = parsed.sort((a,b) => (parseInt(a.min)||0) - (parseInt(b.min)||0))
            }
          }
        }
      }

      // Override/augment with FIFA (primary)
      let calResults = []
      if (fifaResult.status==='fulfilled') {
        calResults = fifaResult.value.Results || []
        for (const m of calResults) {
          const hA = (m.Home?.Abbreviation||m.HomeTeam?.Abbreviation||'').toUpperCase()
          const aA = (m.Away?.Abbreviation||m.AwayTeam?.Abbreviation||'').toUpperCase()
          if (!hA||!aA) continue
          const key   = rawAbKey(hA,aA)
          const existing = newMap[key]||{}
          // FIFA calendar sometimes returns MatchStatus=0 for completed matches.
          // Trust ESPN's state/scores; only take FIFA's IDs, date, and venue.
          const s = m.MatchStatus ?? m.MatchStatusId ?? m.IdMatchStatus ?? m.Status
          const fifaState = s===3 ? 'in' : s>=4 ? 'post' : 'pre'
          const sc = [m.HomeTeamScore??m.Home?.Score??0, m.AwayTeamScore??m.Away?.Score??0]
          const hp = m.HomePenaltyScore ?? m.Home?.PenaltyScore ?? null
          const ap = m.AwayPenaltyScore ?? m.Away?.PenaltyScore ?? null
          const penScore = (hp != null && ap != null) ? [hp, ap] : (existing.penScore || null)
          // Use FIFA's state only when it's definitive (live/post); otherwise keep ESPN's
          const state = fifaState !== 'pre' ? fifaState : (existing.state || 'pre')
          const liveScore = state==='in'
            ? (fifaState==='in' ? sc : existing.liveScore)
            : null
          const postScore = state==='post'
            ? (fifaState==='post' ? sc : existing.postScore)
            : null
          newMap[key] = {
            ...existing,
            mk:      `${m.IdStage}/${m.IdMatch}`,
            idStage: m.IdStage,
            idMatch: m.IdMatch,
            date:    m.Date || existing.date,
            venue:   (() => {
              const stadium = m.Stadium?.Name?.[0]?.Description || ''
              const city = m.Stadium?.CityName?.[0]?.Description
                        || m.Stadium?.City?.[0]?.Description
                        || m.Stadium?.City?.Name?.[0]?.Description
                        || m.Stadium?.CityName || ''
              return appendState([stadium, city].filter(Boolean).join(', ')) || existing.venue || ''
            })(),
            state,
            clock:     fifaState==='in' ? (m.MatchTime||existing.clock||'') : existing.clock||'',
            isHT:      fifaState==='in' ? (m.MatchTime==='HT') : existing.isHT||false,
            liveScore,
            postScore,
            penScore,
            _espnId:   existing._espnId || espnIds[key] || null,
            homeAbbr:  hA, awayAbbr: aA,
          }
        }
      }
      setFifaMap(newMap)

      // ── Live matches ─────────────────────────────────────────
      const liveInMap = Object.entries(newMap).filter(([,v])=>v.state==='in')
      // Prefer FIFA calendar's live entries to get idStage/idMatch
      const liveObjs = []
      for (const [key, entry] of liveInMap) {
        const [a1, a2] = key.split('|')
        const homeAbbr = entry.homeAbbr || a1
        const awayAbbr = entry.awayAbbr || a2
        liveObjs.push({
          mk: entry.mk, idStage: entry.idStage, idMatch: entry.idMatch,
          homeAbbr, awayAbbr,
          homeScore: entry.liveScore?.[0]??0,
          awayScore: entry.liveScore?.[1]??0,
          clock: entry.clock||'',
          isHT:  entry.isHT || entry.clock?.toUpperCase() === 'HT',
        })
      }
      setLiveMatches(liveObjs)

      // ── SofaScore ratings & assists ────────────────────────────
      if (liveObjs.length) {
        const newSofaData = {}
        try {
          const ssLive = await fetch(SS_LIVE).then(r => r.json()).catch(() => ({ events: [] }))
          const ssEvs = ssLive.events || []
          await Promise.all(liveObjs.map(async lm => {
            const nm = s => (s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)
            const ssEv = ssEvs.find(ev => {
              const h = nm(ev.homeTeam?.nameCode), a = nm(ev.awayTeam?.nameCode)
              return (h === nm(lm.homeAbbr) && a === nm(lm.awayAbbr))
                  || (h === nm(lm.awayAbbr) && a === nm(lm.homeAbbr))
            })
            if (!ssEv) return
            try {
              const lu = await fetch(SS_LINEUP(ssEv.id)).then(r => r.json())
              const flipped = nm(ssEv.homeTeam?.nameCode) !== nm(lm.homeAbbr)
              newSofaData[lm.mk] = {
                home: parseSofaLineupSide(flipped ? lu.away : lu.home),
                away: parseSofaLineupSide(flipped ? lu.home : lu.away),
              }
            } catch {}
          }))
        } catch {}
        if (Object.keys(newSofaData).length) setSofaData(prev => ({ ...prev, ...newSofaData }))
      }

      // Fetch live match details from FIFA live endpoint
      const newStats = {}
      await Promise.all(liveObjs.map(async lm => {
        if (!lm.idStage||!lm.idMatch) return
        try {
          const fd = await fetch(FIFA_LIVE(lm.idStage,lm.idMatch)).then(r=>r.json())
          const rawTimeline = parseFifaEventsFromTeams(fd)
          let lu = parseFifaLineup(fd)
          // FIFA live endpoint sometimes designates home/away opposite to the calendar.
          // Detect mismatch and swap so lineup.home always corresponds to lm.homeAbbr.
          const nm3 = s => (s||'').toUpperCase().replace(/[^A-Z]/g,'').slice(0,3)
          const fifaSwapped = lu.fifaHomeAbbr && lm.homeAbbr &&
            nm3(lu.fifaHomeAbbr) !== nm3(lm.homeAbbr) &&
            nm3(lu.fifaHomeAbbr) === nm3(lm.awayAbbr)
          if (fifaSwapped) {
            lu = {
              home: lu.away, homeBench: lu.awayBench||[], homeFormation: lu.awayFormation, homeCoach: lu.awayCoach,
              away: lu.home, awayBench: lu.homeBench||[], awayFormation: lu.homeFormation, awayCoach: lu.homeCoach,
              fifaHomeAbbr: lu.fifaAwayAbbr, fifaAwayAbbr: lu.fifaHomeAbbr,
            }
            newTimelines[lm.mk] = rawTimeline.map(e => ({
              ...e, side: e.side==='home'?'away':e.side==='away'?'home':e.side
            }))
          } else {
            newTimelines[lm.mk] = rawTimeline
          }
          newLineups[lm.mk] = lu
          // Parse team stats from FIFA live data
          const rawFifaStats = parseFifaStats(fd)
          newStats[lm.mk] = fifaSwapped
            ? { home: rawFifaStats.away, away: rawFifaStats.home }
            : rawFifaStats
        } catch { newTimelines[lm.mk] = [] }
      }))

      // Also fetch ESPN summary for live games (merge events + fill stats gaps)
      await Promise.all(liveObjs.map(async lm => {
        const espnId = espnIds[rawAbKey(lm.homeAbbr,lm.awayAbbr)]
        if (!espnId) return
        try {
          const d2 = await fetch(ESPN_SUM(espnId)).then(r=>r.json())
          const espnEvts = parseEspnTimeline(d2)
          const existing = newTimelines[lm.mk]||[]
          if (espnEvts.length>existing.length) newTimelines[lm.mk] = espnEvts
          // Merge ESPN stats to fill gaps from FIFA stats
          const espnS = parseEspnStats(d2)
          const cur = newStats[lm.mk]
          if (!cur || (!cur.home && !cur.away)) {
            newStats[lm.mk] = espnS
          } else {
            for (const side of ['home','away']) {
              for (const [k,v] of Object.entries(espnS[side] || {})) {
                if (cur[side]?.[k] == null) cur[side] = { ...cur[side], [k]: v }
              }
            }
          }
        } catch {}
      }))
      if (Object.keys(newStats).length) setStatsMap(prev => ({ ...prev, ...newStats }))

      // ── Completed match events ────────────────────────────────
      // Step 1: store board events (type + time + side, but no player names from board)
      for (const [key, evts] of Object.entries(eventsFromBoard)) {
        const mk = newMap[key]?.mk
        if (mk) newTimelines[mk] = evts
      }
      // Step 2: fetch ESPN summary to get player names + fill any missing events
      const needSummary = Object.entries(newMap).filter(([key, v]) =>
        v.state === 'post' && !fetchedKeys.current.has(v.mk) && (v._espnId || espnIds[key])
      )
      await Promise.all(needSummary.map(async ([key, entry]) => {
        const espnId = entry._espnId || espnIds[key]
        try {
          const d2 = await fetch(ESPN_SUM(espnId)).then(r=>r.json())
          const sumEvts = parseEspnTimeline(d2)
          const boardEvts = newTimelines[entry.mk] || []
          if (sumEvts.length > 0) {
            // Prefer summary events (have player names); keep board as fallback
            newTimelines[entry.mk] = sumEvts
          } else if (boardEvts.length > 0) {
            // No summary events — at least mark board events as done so we stop retrying
            newTimelines[entry.mk] = boardEvts
          } else {
            return  // nothing — retry next tick
          }
          fetchedKeys.current.add(entry.mk)
        } catch {}
      }))

      setTimelines(prev=>({ ...prev, ...newTimelines }))
      if (Object.keys(newLineups).length) setLineups(prev=>({ ...prev, ...newLineups }))
    }

    load()
    const iv = setInterval(load, 30_000)
    return () => clearInterval(iv)
  }, [])

  // Base resolver (from openfootball only) — used inside augMatches without circular dep
  const resolverFromBase = useMemo(() => buildResolver(computeGroups(matches), matches), [matches])

  // Augment static matches with live API completions (scores + penalties)
  const augMatches = useMemo(()=>matches.map(m=>{
    let fi = fifaMap[abKey(m.team1,m.team2)]
    if (!fi) {
      const r1 = resolverFromBase(m.team1), r2 = resolverFromBase(m.team2)
      if (r1 && r2) fi = fifaMap[abKey(r1, r2)]
    }
    if (m.score?.ft) {
      // Carry penalty scores from FIFA even if openfootball already has ft
      if (!m.score.p && fi?.penScore) return { ...m, score: { ...m.score, p: fi.penScore } }
      return m
    }
    if (fi?.state==='post' && fi?.postScore) {
      return { ...m, score: { ...m.score, ft: fi.postScore, ...(fi.penScore ? { p: fi.penScore } : {}) } }
    }
    return m
  }), [matches, fifaMap, resolverFromBase])

  // Resolves slot codes ("2A", "W73") to real team names using group standings
  const resolveTeam = useMemo(() => buildResolver(computeGroups(augMatches), augMatches), [augMatches])

  const { rounds, activeIdx } = useMemo(()=>{
    const byRound = {}
    for (const m of augMatches) {
      if (!byRound[m.round]) byRound[m.round]=[]
      byRound[m.round].push(m)
    }
    const rounds = Object.entries(byRound).sort((a,b)=>roundNum(a[0])-roundNum(b[0]))
    const todayPT = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date())
    const ptDay = iso => { try { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date(iso)) } catch { return '' } }

    const todayIdx = rounds.findIndex(([,ms])=>ms.some(m=>{
      const fi = fifaMap[abKey(m.team1,m.team2)]
      return fi?.date && ptDay(fi.date)===todayPT
    }))
    if (todayIdx>=0) return { rounds, activeIdx: todayIdx }

    let activeIdx = rounds.findIndex(([,ms])=>ms.some(m=>!m.score?.ft))
    if (activeIdx<0) activeIdx=rounds.length-1
    return { rounds, activeIdx }
  }, [augMatches, fifaMap])

  const visible = useMemo(()=>{
    const ptDay = iso => { try { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date(iso)) } catch { return '' } }
    const todayPT = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date())

    const resolveFifaInfo = (m) => {
      const direct = fifaMap[abKey(m.team1, m.team2)]
      if (direct) return direct
      const r1 = resolveTeam(m.team1), r2 = resolveTeam(m.team2)
      return (r1 && r2) ? fifaMap[abKey(r1, r2)] : null
    }

    const dayMap = {}
    for (const m of augMatches) {
      const fi = resolveFifaInfo(m)
      const day = ptDay(fi?.date) || m.date || ''
      if (!day) continue
      if (!dayMap[day]) dayMap[day] = []
      dayMap[day].push(m)
    }

    const allDays = Object.keys(dayMap).sort()
    let todayIdx = allDays.indexOf(todayPT)
    if (todayIdx < 0) todayIdx = allDays.findIndex(d => d > todayPT)
    if (todayIdx < 0) todayIdx = allDays.length - 1

    const out = []
    for (const offset of [-1, 0, 1]) {
      const i = todayIdx + offset
      if (i < 0 || i >= allDays.length) continue
      const day = allDays[i]
      const ms  = dayMap[day] || []
      const roundName = ms[0]?.round || day
      out.push({ roundName, ms, dayOffset: offset, day })
    }
    return out
  }, [augMatches, fifaMap, resolveTeam])

  const statusMap = useMemo(()=>buildTeamStatusMap(computeGroups(augMatches)), [augMatches])
  const hasLive   = liveMatches.length>0
  const liveCount = liveMatches.length
  useEffect(()=>{ onLiveChange?.(hasLive) }, [hasLive, onLiveChange])
  const safeIdx    = Math.min(currentLiveIdx, Math.max(liveCount-1,0))
  const currentLive = liveMatches[safeIdx]

  // Build the 2 pinned live panels — stay visible until both finish
  const panelMatch = sidePanelMks.map(mk => {
    if (!mk) return null
    const live = liveMatches.find(m => m.mk === mk)
    if (live) return live
    // Game finished — pull final score from fifaMap and show FT
    const entry = Object.values(fifaMap).find(v => v.mk === mk)
    if (!entry) return null
    return {
      mk, homeAbbr: entry.homeAbbr||'', awayAbbr: entry.awayAbbr||'',
      homeScore: entry.postScore?.[0] ?? 0, awayScore: entry.postScore?.[1] ?? 0,
      clock: 'FT', isHT: false, penScore: entry.penScore || null,
    }
  })

  return (
    <div className="mx-outer">
      <div className={`mx-schedule-row${sidePanelMode ? ' live-active' : hasLive ? '' : ' no-live'}`}>
        {sidePanelMode ? (
          <>
            <div className="mx-sp-center">
              {(() => {
                const today = visible.find(v => v.dayOffset === 0)
                if (!today) return null
                return (
                  <RoundBlock
                    key={today.day}
                    roundName={today.roundName}
                    ms={today.ms}
                    highlight={true}
                    dayOffset={0}
                    showDetails={true}
                    fifaMap={fifaMap}
                    statusMap={statusMap}
                    timelines={timelines}
                    rankings={rankings}
                    resolveTeam={resolveTeam}
                  />
                )
              })()}
            </div>
            <LiveSidePanel
              liveMatch={panelMatch[0]}
              timeline={panelMatch[0] ? (timelines[panelMatch[0].mk]||[]) : []}
              lineup={panelMatch[0] ? lineups[panelMatch[0].mk] : null}
              sofaPlayers={sofaData[panelMatch[0]?.mk]}
              stats={statsMap[panelMatch[0]?.mk]}
              powerRatings={powerRatings}
              panelSide="right"
            />
            {panelMatch[1] && (
              <LiveSidePanel
                liveMatch={panelMatch[1]}
                timeline={timelines[panelMatch[1].mk]||[]}
                lineup={lineups[panelMatch[1].mk]}
                sofaPlayers={sofaData[panelMatch[1].mk]}
                stats={statsMap[panelMatch[1].mk]}
                powerRatings={powerRatings}
                panelSide="right"
              />
            )}
          </>
        ) : (
          visible.map(({ roundName, ms, dayOffset, day }) => (
            <RoundBlock
              key={day}
              roundName={roundName}
              ms={ms}
              highlight={dayOffset === 0}
              dayOffset={dayOffset}
              showDetails={dayOffset === 0 || dayOffset === -1}
              fifaMap={fifaMap}
              statusMap={dayOffset <= 0 ? statusMap : undefined}
              timelines={timelines}
              rankings={rankings}
              resolveTeam={resolveTeam}
            />
          ))
        )}
      </div>

      {hasLive && !sidePanelMode && (
        <div className="mx-live-section">
          <div className="mx-live-section-label">
            <span className="mx-live-dot" />
            LIVE NOW — {liveCount} match{liveCount>1?'es':''}
            {liveCount>1 && (
              <span className="mx-live-game-dots">
                {liveMatches.map((_,i)=>(
                  <button key={i} className={`mx-live-game-dot${i===safeIdx?' on':''}`}
                    onClick={()=>setCurrentLiveIdx(i)} />
                ))}
              </span>
            )}
          </div>
          {currentLive && (
            <LiveMatchTile
              key={currentLive.mk}
              event={currentLive}
              timeline={timelines[currentLive.mk]||[]}
              lineup={lineups[currentLive.mk]}
            />
          )}
        </div>
      )}
    </div>
  )
}
