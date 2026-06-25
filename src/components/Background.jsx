import { useEffect, useRef } from 'react'

const ORBS = [
  { bx: 0.18, by: 0.52, ax: 0.28, ay: 0.20, spd: 0.28, r: 0.72, h: 142, s: 62, l: 13 },
  { bx: 0.82, by: 0.32, ax: 0.22, ay: 0.28, spd: 0.21, r: 0.62, h: 178, s: 46, l: 11 },
  { bx: 0.50, by: 0.72, ax: 0.30, ay: 0.16, spd: 0.34, r: 0.58, h:  42, s: 66, l: 17 },
  { bx: 0.10, by: 0.20, ax: 0.16, ay: 0.32, spd: 0.17, r: 0.52, h: 118, s: 54, l: 11 },
  { bx: 0.90, by: 0.80, ax: 0.24, ay: 0.22, spd: 0.27, r: 0.46, h: 198, s: 40, l:  9 },
  { bx: 0.42, by: 0.18, ax: 0.20, ay: 0.24, spd: 0.38, r: 0.40, h:  60, s: 50, l: 14 },
]

export default function Background() {
  const ref = useRef()

  useEffect(() => {
    const c = ref.current
    const ctx = c.getContext('2d', { alpha: false })

    const resize = () => {
      c.width = window.innerWidth
      c.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    let t = 0, last = 0, raf

    const draw = (now) => {
      raf = requestAnimationFrame(draw)
      if (now - last < 33) return   // cap at ~30fps for Pi
      last = now
      t += 0.033

      const W = c.width, H = c.height, S = Math.min(W, H)

      // Base fill
      ctx.fillStyle = '#010d04'
      ctx.fillRect(0, 0, W, H)

      // Animated orbs
      for (const o of ORBS) {
        const x = (o.bx + Math.cos(t * o.spd) * o.ax) * W
        const y = (o.by + Math.sin(t * o.spd * 1.31 + 1.05) * o.ay) * H
        const r = o.r * S
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0,    `hsla(${o.h},${o.s}%,${o.l}%,0.75)`)
        g.addColorStop(0.45, `hsla(${o.h},${o.s}%,${o.l * .5}%,0.12)`)
        g.addColorStop(1,    'hsla(0,0%,0%,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
      }

      // Subtle pitch markings
      ctx.save()
      ctx.globalAlpha = 0.028
      ctx.strokeStyle = '#55ff88'
      ctx.lineWidth = 1.5
      // Center line
      ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke()
      // Center circle
      ctx.beginPath(); ctx.arc(W / 2, H / 2, S * 0.13, 0, Math.PI * 2); ctx.stroke()
      // Center spot
      ctx.fillStyle = '#55ff88'
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 4, 0, Math.PI * 2); ctx.fill()
      // Penalty areas
      ctx.strokeRect(W * 0.065, H * 0.21, W * 0.135, H * 0.58)
      ctx.strokeRect(W * 0.80, H * 0.21, W * 0.135, H * 0.58)
      // Goal areas
      ctx.strokeRect(W * 0.065, H * 0.35, W * 0.045, H * 0.30)
      ctx.strokeRect(W * 0.89, H * 0.35, W * 0.045, H * 0.30)
      ctx.restore()

      // Vignette overlay
      const vig = ctx.createRadialGradient(W / 2, H / 2, S * 0.18, W / 2, H / 2, S * 0.88)
      vig.addColorStop(0, 'rgba(0,0,0,0)')
      vig.addColorStop(1, 'rgba(0,0,0,0.74)')
      ctx.fillStyle = vig
      ctx.fillRect(0, 0, W, H)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} className="bg-canvas" />
}
