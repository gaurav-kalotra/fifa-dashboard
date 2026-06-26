const ISO2 = {
  "Mexico":"mx","South Africa":"za","South Korea":"kr","Czech Republic":"cz",
  "Canada":"ca","Bosnia & Herzegovina":"ba","Qatar":"qa","Switzerland":"ch",
  "Brazil":"br","Morocco":"ma","Haiti":"ht","Scotland":"gb-sct",
  "USA":"us","Paraguay":"py","Australia":"au","Turkey":"tr",
  "Germany":"de","Curaçao":"cw","Ivory Coast":"ci","Ecuador":"ec",
  "Netherlands":"nl","Japan":"jp","Sweden":"se","Tunisia":"tn",
  "Belgium":"be","Egypt":"eg","Iran":"ir","New Zealand":"nz",
  "Spain":"es","Cape Verde":"cv","Saudi Arabia":"sa","Uruguay":"uy",
  "France":"fr","Senegal":"sn","Iraq":"iq","Norway":"no",
  "Argentina":"ar","Algeria":"dz","Austria":"at","Jordan":"jo",
  "Portugal":"pt","DR Congo":"cd","Uzbekistan":"uz","Colombia":"co",
  "England":"gb-eng","Croatia":"hr","Ghana":"gh","Panama":"pa",
}

const NAME_NORM = { "Türkiye": "Turkey", "Côte d'Ivoire": "Ivory Coast", "United States": "USA", "United States of America": "USA", "Korea Republic": "South Korea", "Republic of Korea": "South Korea" }

// Reverse ABBR map: 3-letter code → canonical name for flagUrl
const ABBR_TO_NAME = {}

export const flagUrl = (name) => {
  if (!name) return null
  // Try direct name lookup first, then 3-letter abbr reverse lookup
  const norm = NAME_NORM[name] || name
  const code = ISO2[norm] || ISO2[ABBR_TO_NAME[norm.toUpperCase()]]
  return code ? `https://flagcdn.com/w40/${code}.png` : null
}

export const ABBR = {
  "Mexico":"MEX","South Africa":"RSA","South Korea":"KOR","Czech Republic":"CZE",
  "Canada":"CAN","Bosnia & Herzegovina":"BIH","Qatar":"QAT","Switzerland":"SUI",
  "Brazil":"BRA","Morocco":"MAR","Haiti":"HAI","Scotland":"SCO",
  "USA":"USA","Paraguay":"PAR","Australia":"AUS","Turkey":"TUR",
  "Germany":"GER","Curaçao":"CUW","Ivory Coast":"CIV","Ecuador":"ECU",
  "Netherlands":"NED","Japan":"JPN","Sweden":"SWE","Tunisia":"TUN",
  "Belgium":"BEL","Egypt":"EGY","Iran":"IRN","New Zealand":"NZL",
  "Spain":"ESP","Cape Verde":"CPV","Saudi Arabia":"KSA","Uruguay":"URU",
  "France":"FRA","Senegal":"SEN","Iraq":"IRQ","Norway":"NOR",
  "Argentina":"ARG","Algeria":"ALG","Austria":"AUT","Jordan":"JOR",
  "Portugal":"POR","DR Congo":"COD","Uzbekistan":"UZB","Colombia":"COL",
  "England":"ENG","Croatia":"CRO","Ghana":"GHA","Panama":"PAN",
}

// Populate reverse map after ABBR is defined
for (const [name, code] of Object.entries(ABBR)) ABBR_TO_NAME[code] = name

export const ab = (n) => ABBR[n] || (n ? n.slice(0, 3).toUpperCase() : '')

export function computeGroups(matches) {
  const groups = {}
  for (const m of matches) {
    if (!m.group) continue
    const g = m.group.replace('Group ', '')
    if (!groups[g]) groups[g] = {}
    for (const t of [m.team1, m.team2]) {
      if (!groups[g][t]) groups[g][t] = { t, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, p: 0 }
    }
    if (!m.score?.ft) continue
    const [a, b] = m.score.ft
    const A = groups[g][m.team1], B = groups[g][m.team2]
    A.gf += a; A.ga += b; B.gf += b; B.ga += a; A.p++; B.p++
    if (a > b) { A.w++; A.pts += 3; B.l++ }
    else if (b > a) { B.w++; B.pts += 3; A.l++ }
    else { A.d++; B.d++; A.pts++; B.pts++ }
  }
  const ranked = {}
  for (const g of Object.keys(groups)) {
    ranked[g] = Object.values(groups[g]).sort(
      (x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.t.localeCompare(y.t)
    )
  }
  return ranked
}

export function teamStatus(entries, i) {
  const e = entries[i]
  const groupDone = entries.every(x => x.p === 3)
  if (groupDone) {
    if (i <= 1) return 'qual'
    if (i === 2) return 'tbd'
    return 'elim'
  }
  const maxPts = e.pts + (3 - e.p) * 3
  const second = entries[1]
  if (i >= 2 && maxPts < (second?.pts ?? 0)) return 'elim'
  if (i <= 1) {
    const third = entries[2]
    const thirdMax = (third?.pts ?? 0) + (3 - (third?.p ?? 0)) * 3
    if (thirdMax < e.pts) return 'qual'
  }
  return 'tbd'
}

export function buildTeamStatusMap(groups) {
  const map = {}
  for (const entries of Object.values(groups)) {
    entries.forEach((e, i) => { map[e.t] = teamStatus(entries, i) })
  }
  return map
}

export function buildResolver(rankedGroups, matches) {
  const byNum = {}
  for (const m of matches) if (m.num) byNum[m.num] = m

  function groupSlot(code) {
    const pos = +code[0], grp = code.slice(1)
    const r = rankedGroups[grp]
    if (!r) return null
    const played = r.reduce((s, t) => s + t.p, 0)
    if (played < 12) return null // group not yet finished
    return r[pos - 1]?.t || null
  }

  function winnerOf(num) {
    const m = byNum[num]
    if (!m?.score?.ft) return null
    const [a, b] = m.score.ft
    if (a === b) return null
    return resolve(a > b ? m.team1 : m.team2)
  }

  function resolve(code) {
    if (!code) return null
    if (ABBR[code]) return code
    if (/^[12][A-L]$/.test(code)) return groupSlot(code)
    if (/^W\d+$/.test(code)) return winnerOf(+code.slice(1))
    return null
  }

  return resolve
}
