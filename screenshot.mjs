import { chromium } from 'playwright'

const browser = await chromium.launch()

// Matches tab
const p1 = await browser.newPage()
await p1.setViewportSize({ width: 1920, height: 1080 })
await p1.goto('http://localhost:5173/?tv=1', { waitUntil: 'load', timeout: 15000 })
await p1.waitForTimeout(2000)
await p1.screenshot({ path: 'C:/Users/gaura/.claude/jobs/b422886b/tmp/bright_matches.png' })
await p1.close()

// Schedule tab
const p2 = await browser.newPage()
await p2.setViewportSize({ width: 1920, height: 1080 })
await p2.addInitScript(() => {
  const _si = window.setInterval
  window.setInterval = (fn, delay, ...args) => {
    if (delay === 30000) { let f=false; return _si(()=>{if(!f){f=true;fn()}},800) }
    return _si(fn, delay, ...args)
  }
})
await p2.goto('http://localhost:5173/?tv=1', { waitUntil: 'load', timeout: 15000 })
await p2.waitForTimeout(3000)
await p2.screenshot({ path: 'C:/Users/gaura/.claude/jobs/b422886b/tmp/bright_schedule.png' })
await p2.close()

await browser.close()
console.log('done')
