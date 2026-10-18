import { App, button, h, Katrien, player, WalletBar, type Screen } from '../app'
import { audio } from '../audio'
import { pet } from '../pets'
import {
  canPlace, fullLines, GEM_EMOJI, newGame, pieceSize, place, rescue, SIZE,
  type ClearedCell, type GameState, type Gem, type Piece,
} from '../game/board'
import { Rng } from '../game/rng'
import { makeSum } from '../game/sums'
import { PapaFlyby } from './papa'

// Bright rainbow blocks, readable on the lila board.
const PALETTE = ['#ff5d8f', '#ff9a3d', '#ffd23f', '#4fd17a', '#38c6e6', '#5b8cff', '#a66bff']

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface Layout {
  W: number
  H: number
  board: Rect
  cell: number
  slots: Rect[]
  trayCell: number
  kat: Rect
  portrait: boolean
}

interface Drag {
  index: number
  pointerId: number
  x: number
  y: number
  lift: number
  /** Lift for a touch at the top of the board; it shrinks near the bottom edge of the screen. */
  baseLift: number
  rows: number
  t0: number
  /** Snapped board position when the piece fits there. */
  at: { r: number; c: number } | null
}

interface Pop {
  x: number
  y: number
  color: number
  gem?: Gem
  t0: number
  delay: number
  burst?: boolean
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: string
  size: number
  star: boolean
}

interface Flyer {
  gem: Gem
  x0: number
  y0: number
  t0: number
  delay: number
  dur: number
}

interface Heart {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  size: number
  emoji: string
  t0: number
  life: number
}

interface Float {
  text: string
  sub?: string
  x: number
  y: number
  t0: number
  big: boolean
}

const PRAISE: Record<number, string[]> = {
  1: ['Goed zo!', 'Mooi!', 'Ja!', 'Netjes!', 'Knap!'],
  2: ['Super!', 'Twee tegelijk!', 'Hoera!'],
  3: ['Wauw!', 'Drie tegelijk!', 'Geweldig!'],
  4: ['Fantastisch!', 'Ongelooflijk!', 'Regenboogkracht!'],
}

const GEM_SAY: Record<Gem, string[]> = {
  bloem: ['Een bloem voor mijn eiland!', 'Bloemetje!'],
  schelp: ['Een schelp!', 'Schelpjes zijn mooi.'],
  ster: ['Een ster! Wauw!', 'Sterretje!'],
  diamant: ['Een diamant!', 'Glitter glitter!'],
}

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)

/** Rounded block with a soft bevel, cached per colour and size. */
class BlockArt {
  private cache = new Map<string, HTMLCanvasElement>()
  dpr = 1

  get(color: number, size: number, ghost = false): HTMLCanvasElement {
    const px = Math.max(4, Math.round(size * this.dpr))
    const key = `${color}:${px}:${ghost}`
    let c = this.cache.get(key)
    if (c) return c
    c = document.createElement('canvas')
    c.width = c.height = px
    const g = c.getContext('2d')!
    const base = PALETTE[color % PALETTE.length]
    const r = px * 0.2
    const inset = px * 0.04
    const rr = (x: number, y: number, w: number, hh: number, rad: number) => {
      g.beginPath()
      g.roundRect(x, y, w, hh, rad)
    }
    g.globalAlpha = ghost ? 0.45 : 1
    // Dark rim
    rr(inset, inset, px - inset * 2, px - inset * 2, r)
    g.fillStyle = shade(base, -0.28)
    g.fill()
    // Body
    rr(inset, inset, px - inset * 2, px - inset * 2 - px * 0.08, r)
    const grad = g.createLinearGradient(0, 0, 0, px)
    grad.addColorStop(0, shade(base, 0.32))
    grad.addColorStop(0.55, base)
    grad.addColorStop(1, shade(base, -0.08))
    g.fillStyle = grad
    g.fill()
    // Shine
    rr(px * 0.18, px * 0.12, px * 0.42, px * 0.14, px * 0.07)
    g.fillStyle = 'rgba(255,255,255,0.55)'
    g.fill()
    rr(px * 0.12, px * 0.12, px * 0.12, px * 0.12, px * 0.06)
    g.fillStyle = 'rgba(255,255,255,0.35)'
    g.fill()
    this.cache.set(key, c)
    return c
  }

  clear(): void {
    this.cache.clear()
  }
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) & 255
  let g = (n >> 8) & 255
  let b = n & 255
  const f = (v: number) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))
  r = f(r)
  g = f(g)
  b = f(b)
  return `rgb(${r},${g},${b})`
}

function computeLayout(W: number, H: number, top: number): Layout {
  const portrait = H >= W * 0.95
  const pad = 16
  if (portrait) {
    const katH = Math.min(170, Math.max(90, H * 0.14))
    const trayH = Math.min(230, Math.max(150, H * 0.19))
    const avail = H - top - katH - trayH - pad * 2
    const B = Math.floor(Math.min(W - pad * 2, avail, 680) / SIZE) * SIZE
    const bx = Math.round((W - B) / 2)
    const by = Math.round(top + katH + (avail - B) / 2 + pad * 0.5)
    const trayTop = by + B + pad
    const trayRealH = H - trayTop - pad
    const slotW = (Math.min(W, B + 120) - pad * 2) / 3
    const sx = (W - slotW * 3) / 2
    const slots = [0, 1, 2].map((i) => ({ x: sx + i * slotW, y: trayTop, w: slotW, h: trayRealH }))
    const trayCell = Math.min(B / SIZE * 0.6, slotW / 5.6, trayRealH / 5.6)
    return { W, H, board: { x: bx, y: by, w: B, h: B }, cell: B / SIZE, slots, trayCell, kat: { x: bx, y: by - katH, w: B, h: katH }, portrait }
  }
  const sideW = Math.max(260, Math.min(420, W * 0.34))
  const availH = H - top - pad * 2
  // Leave room for the board's rim on every side.
  const B = Math.floor(Math.min(availH - 24, W - sideW - pad * 5, 720) / SIZE) * SIZE
  const gap = Math.max(pad * 1.75, (W - B - sideW) / 3)
  const bx = Math.round(gap)
  const by = Math.round(top + pad + (availH - B) / 2)
  const sx = bx + B + gap
  const katH = Math.min(170, availH * 0.26)
  const slotH = (availH - katH) / 3
  const slots = [0, 1, 2].map((i) => ({ x: sx, y: top + pad + katH + i * slotH, w: sideW, h: slotH }))
  const trayCell = Math.min(B / SIZE * 0.6, sideW / 5.6, slotH / 5.4)
  return { W, H, board: { x: bx, y: by, w: B, h: B }, cell: B / SIZE, slots, trayCell, kat: { x: sx, y: top + pad, w: sideW, h: katH }, portrait }
}

export function playScreen(app: App): Screen {
  const rng = new Rng()
  const save = app.save
  let state: GameState = save.game && !save.game.over ? save.game : newGame(rng)
  if (!save.game || save.game.over) {
    save.game = state
    save.bestBefore = save.best
    app.persist()
  }
  const firstEver = save.games === 0 && state.score === 0
  // The record to beat in this game (the live best already counts this game's score).
  let bestAtStart = save.bestBefore ?? save.best

  // ---- DOM ----
  const scoreNum = h('div', { class: 'score-num' }, String(state.score))
  const best = h('div', { class: 'score-best' }, `👑 ${save.best}`)
  const comboPill = h('div', { class: 'combo-pill' })
  const wallet = new WalletBar(save.wallet)
  const home = button('🏠', 'round-btn', () => {
    audio.play('tap')
    app.persist()
    app.go('menu')
  })
  const hud = h('header', { class: 'hud' }, home, h('div', { class: 'score' }, scoreNum, best, comboPill), wallet.el)
  const canvas = h('canvas', { class: 'stage' })
  const kat = new Katrien('play-kat')
  const overlay = h('div', { class: 'overlay' })
  const el = h('div', { class: 'screen play' }, canvas, hud, kat.el, overlay)
  const ctx = canvas.getContext('2d')!
  const art = new BlockArt()
  const papa = new PapaFlyby(el)

  let L: Layout = computeLayout(innerWidth, innerHeight, 90)
  let dpr = 1
  let drag: Drag | null = null
  let pops: Pop[] = []
  let parts: Particle[] = []
  let flyers: Flyer[] = []
  let floats: Float[] = []
  let hearts: Heart[] = []
  // Papa comes by now and then: first after half a minute or so, then every minute or two.
  let nextPapa = performance.now() + 25000 + Math.random() * 20000
  let placedFlash: { cells: [number, number][]; t0: number } | null = null
  let trayIn = performance.now()
  let shake = { t0: 0, amp: 0 }
  let sweep: { t0: number; lines: { rows: number[]; cols: number[] } } | null = null
  let overTimer = 0
  let raf = 0
  let alive = true
  let shownScore = state.score

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 3)
    const W = el.clientWidth || innerWidth
    const H = el.clientHeight || innerHeight
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    art.dpr = dpr
    art.clear()
    const top = hud.getBoundingClientRect().bottom + 4
    L = computeLayout(W, H, top)
    Object.assign(kat.el.style, {
      left: `${L.kat.x}px`,
      top: `${L.kat.y}px`,
      width: `${L.kat.w}px`,
      height: `${L.kat.h}px`,
    })
    kat.el.classList.toggle('side', !L.portrait)
    papa.resize()
  }

  // ---- Drawing ----
  const cellXY = (r: number, c: number) => ({ x: L.board.x + c * L.cell, y: L.board.y + r * L.cell })

  function drawBlock(color: number, x: number, y: number, size: number, gem?: Gem, alpha = 1, ghost = false): void {
    ctx.globalAlpha = alpha
    ctx.drawImage(art.get(color, size, ghost), x, y, size, size)
    if (gem && !ghost) {
      ctx.font = `${Math.round(size * 0.56)}px system-ui, "Apple Color Emoji"`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      // Emoji take the alpha of fillStyle, so make it opaque.
      ctx.fillStyle = '#000'
      ctx.fillText(GEM_EMOJI[gem], x + size / 2, y + size * 0.47)
    }
    ctx.globalAlpha = 1
  }

  function drawBackground(now: number): void {
    // Soft rainbow arc behind the board
    const { W, H } = L
    const cx = W / 2
    const cy = L.board.y + L.board.h * 0.55
    const R = Math.max(W, H) * 0.62
    const bands = ['#ffb3c1', '#ffd3a8', '#fff1a8', '#c4ecb8', '#b8dcfa', '#d6c4fa']
    ctx.globalAlpha = 0.35
    ctx.lineWidth = R * 0.035
    bands.forEach((col, i) => {
      ctx.strokeStyle = col
      ctx.beginPath()
      ctx.arc(cx, cy, R - i * ctx.lineWidth, Math.PI * 1.05, Math.PI * 1.95)
      ctx.stroke()
    })
    ctx.globalAlpha = 1
    // Drifting clouds
    for (let i = 0; i < 4; i++) {
      const x = ((now * 0.008 * (0.6 + i * 0.2) + i * 340) % (W + 300)) - 150
      const y = 70 + i * (H * 0.2)
      cloud(x, y, 34 + i * 6)
    }
  }

  function cloud(x: number, y: number, s: number): void {
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    ctx.arc(x, y, s, 0, Math.PI * 2)
    ctx.arc(x + s * 0.9, y + s * 0.2, s * 0.75, 0, Math.PI * 2)
    ctx.arc(x - s * 0.9, y + s * 0.25, s * 0.65, 0, Math.PI * 2)
    ctx.fill()
  }

  function drawBoard(now: number): void {
    const { board, cell } = L
    const pad = cell * 0.18
    ctx.fillStyle = '#5c4896'
    ctx.beginPath()
    ctx.roundRect(board.x - pad, board.y - pad, board.w + pad * 2, board.h + pad * 2, cell * 0.35)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 3
    ctx.stroke()

    // Which lines would clear with the piece being dragged?
    let preview: { rows: number[]; cols: number[] } = { rows: [], cols: [] }
    let ghost: [number, number][] = []
    let ghostColor = 0
    if (drag?.at) {
      const p = state.tray[drag.index]!
      ghost = p.cells.map(([r, c]) => [drag!.at!.r + r, drag!.at!.c + c])
      ghostColor = p.color
      preview = fullLines(state.grid, ghost)
    }
    const inPreview = (r: number, c: number) => preview.rows.includes(r) || preview.cols.includes(c)

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const { x, y } = cellXY(r, c)
        ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)'
        ctx.beginPath()
        ctx.roundRect(x + cell * 0.04, y + cell * 0.04, cell * 0.92, cell * 0.92, cell * 0.16)
        ctx.fill()
        const v = state.grid[r][c]
        if (!v) continue
        let s = cell
        let ox = 0
        if (placedFlash) {
          const t = (now - placedFlash.t0) / 220
          if (t < 1 && placedFlash.cells.some(([pr, pc]) => pr === r && pc === c)) {
            s = cell * (1 + 0.12 * Math.sin(t * Math.PI))
            ox = (cell - s) / 2
          }
        }
        const color = inPreview(r, c) ? ghostColor : v.color
        drawBlock(color, x + ox, y + ox, s, v.gem)
        if (inPreview(r, c)) {
          // Lines about to clear glow gently.
          ctx.fillStyle = `rgba(255,255,255,${0.18 + 0.12 * Math.sin(now / 90)})`
          ctx.beginPath()
          ctx.roundRect(x + 2, y + 2, cell - 4, cell - 4, cell * 0.2)
          ctx.fill()
        }
      }
    }
    if (ghost.length) {
      const p = state.tray[drag!.index]!
      p.cells.forEach(([r, c], i) => {
        const { x, y } = cellXY(drag!.at!.r + r, drag!.at!.c + c)
        drawBlock(p.color, x, y, cell, i === p.gemAt ? p.gem : undefined, 0.5)
      })
    }

    if (state.over && !overlay.classList.contains('show') && overTimer) {
      // The board rests while the "no room" card is on its way.
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.fillRect(board.x, board.y, board.w, board.h)
    }
  }

  function drawSweep(now: number): void {
    if (!sweep) return
    const t = (now - sweep.t0) / 420
    if (t > 1) {
      sweep = null
      return
    }
    const { board, cell } = L
    ctx.save()
    ctx.globalAlpha = 1 - t
    const grad = ctx.createLinearGradient(board.x, 0, board.x + board.w, 0)
    ;['#ffb3c1', '#ffd3a8', '#fff1a8', '#c4ecb8', '#b8dcfa', '#d6c4fa'].forEach((c, i) => grad.addColorStop(i / 5, c))
    ctx.fillStyle = grad
    const grow = cell * 0.4 * ease(t)
    for (const r of sweep.lines.rows) ctx.fillRect(board.x, board.y + r * cell - grow / 2, board.w, cell + grow)
    for (const c of sweep.lines.cols) ctx.fillRect(board.x + c * cell - grow / 2, board.y, cell + grow, board.h)
    ctx.restore()
  }

  function drawPops(now: number): void {
    pops = pops.filter((p) => {
      const t = (now - p.t0 - p.delay) / 320
      if (t > 1) return false
      if (t < 0) {
        drawBlock(p.color, p.x, p.y, L.cell, p.gem)
        return true
      }
      const s = L.cell * (1 + 0.25 * t) * (1 - ease(t) * 0.9)
      drawBlock(p.color, p.x + (L.cell - s) / 2, p.y + (L.cell - s) / 2, s, undefined, 1 - t * 0.6)
      if (!p.burst) {
        p.burst = true
        burst(p.x + L.cell / 2, p.y + L.cell / 2, PALETTE[p.color], 5)
      }
      return true
    })
  }

  function burst(x: number, y: number, color: string, n: number, speed = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const v = (1.5 + Math.random() * 4) * speed
      parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 0, max: 40 + Math.random() * 30,
        color: Math.random() < 0.3 ? '#ffffff' : color, size: L.cell * (0.08 + Math.random() * 0.12), star: Math.random() < 0.35,
      })
    }
  }

  function drawParticles(): void {
    parts = parts.filter((p) => {
      p.life++
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.18
      p.vx *= 0.98
      if (p.life > p.max) return false
      ctx.globalAlpha = 1 - p.life / p.max
      ctx.fillStyle = p.color
      if (p.star) star(p.x, p.y, p.size)
      else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
      return true
    })
    ctx.globalAlpha = 1
  }

  function star(x: number, y: number, s: number): void {
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2
      const rad = i % 2 ? s * 0.45 : s
      ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad)
    }
    ctx.closePath()
    ctx.fill()
  }

  function drawFlyers(now: number): void {
    flyers = flyers.filter((f) => {
      const t = (now - f.t0 - f.delay) / f.dur
      if (t < 0) return true
      const to = wallet.target(f.gem)
      if (t >= 1) {
        wallet.set(f.gem, wallet.shown[f.gem] + 1)
        audio.play('gem')
        return false
      }
      const e = ease(t)
      // Arc upwards on the way to the counter.
      const x = f.x0 + (to.x - f.x0) * e
      const y = f.y0 + (to.y - f.y0) * e - Math.sin(t * Math.PI) * 80
      const s = L.cell * (0.8 - 0.35 * t)
      ctx.font = `${Math.round(s)}px system-ui, "Apple Color Emoji"`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#000'
      ctx.fillText(GEM_EMOJI[f.gem], x, y)
      return true
    })
  }

  function drawFloats(now: number): void {
    floats = floats.filter((f) => {
      const t = (now - f.t0) / (f.big ? 1400 : 800)
      if (t > 1) return false
      const y = f.y - ease(t) * (f.big ? 40 : 50)
      const pop = f.big ? 0.6 + 0.4 * ease(t * 4) : 1
      ctx.globalAlpha = t > 0.75 ? (1 - t) * 4 : 1
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const size = (f.big ? L.cell * 0.9 : L.cell * 0.45) * pop
      ctx.font = `900 ${Math.round(size)}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`
      ctx.lineWidth = size * 0.18
      ctx.strokeStyle = '#6e4fb8'
      ctx.lineJoin = 'round'
      ctx.strokeText(f.text, f.x, y)
      ctx.fillStyle = f.big ? '#fff6a8' : '#ffffff'
      ctx.fillText(f.text, f.x, y)
      if (f.sub) {
        const ss = size * 0.5
        ctx.font = `800 ${Math.round(ss)}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`
        ctx.lineWidth = ss * 0.2
        ctx.strokeText(f.sub, f.x, y + size * 0.85)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(f.sub, f.x, y + size * 0.85)
      }
      ctx.globalAlpha = 1
      return true
    })
  }

  function drawHearts(now: number): void {
    hearts = hearts.filter((ht) => {
      const age = (now - ht.t0) / 1000
      if (age < 0) return true
      if (age > ht.life) return false
      ht.x += ht.vx
      ht.y += ht.vy
      ht.vy += 0.16
      ht.vx *= 0.99
      ht.rot += ht.vr
      ctx.save()
      ctx.globalAlpha = age > ht.life - 0.4 ? Math.max(0, (ht.life - age) / 0.4) : 1
      ctx.translate(ht.x, ht.y)
      ctx.rotate(ht.rot)
      ctx.font = `${Math.round(ht.size)}px system-ui, "Apple Color Emoji"`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#000'
      ctx.fillText(ht.emoji, 0, 0)
      ctx.restore()
      return true
    })
  }

  // ---- Papa in his helicopter ----
  function sendPapa(): void {
    nextPapa = performance.now() + 60000 + Math.random() * 60000
    papa.fly(L.board.y + L.board.h * 0.28)
    audio.play('heli')
    window.setTimeout(() => papa.flying && kat.say('Kijk, Papa! Tik op hem!', 2200), 900)
  }

  /** A tap on Papa: he bursts into a shower of hearts and leaves a diamond. */
  function popPapa(): void {
    const at = papa.pos!
    papa.pop()
    const now = performance.now()
    const emojis = ['💖', '💕', '💗', '💓', '❤️', '🩷', '💜', '✨']
    // The burst
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2
      const v = 4 + Math.random() * 9
      hearts.push({
        x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5, rot: 0, vr: (Math.random() - 0.5) * 0.2,
        size: L.cell * (0.4 + Math.random() * 0.5), emoji: emojis[i % emojis.length], t0: now, life: 1.6 + Math.random(),
      })
    }
    // Then a shower falling over the whole screen
    for (let i = 0; i < 70; i++) {
      hearts.push({
        x: Math.random() * L.W, y: -40 - Math.random() * 80, vx: (Math.random() - 0.5) * 1.5, vy: 1 + Math.random() * 3,
        rot: (Math.random() - 0.5) * 0.6, vr: (Math.random() - 0.5) * 0.08, size: L.cell * (0.35 + Math.random() * 0.45),
        emoji: emojis[i % emojis.length], t0: now + 150 + Math.random() * 1400, life: 3.2,
      })
    }
    burst(at.x, at.y, '#ff8fc0', 24, 1.6)
    shake = { t0: now, amp: 8 }
    audio.play('pop')
    audio.play('victory')
    window.setTimeout(() => audio.play('purr'), 500)
    kat.pose('confetti', 2400)
    kat.say('Hoera, Papa! Een diamant!', 2400)
    flyers.push({ gem: 'diamant', x0: at.x, y0: at.y, t0: now, delay: 600, dur: 900 })
    save.wallet.diamant += 1
    state.gemsThisGame.diamant += 1
    app.persist()
  }

  function drawPiece(p: Piece, cx: number, cy: number, cell: number, alpha = 1): void {
    const { rows, cols } = pieceSize(p)
    const x0 = cx - (cols * cell) / 2
    const y0 = cy - (rows * cell) / 2
    p.cells.forEach(([r, c], i) => drawBlock(p.color, x0 + c * cell, y0 + r * cell, cell, i === p.gemAt ? p.gem : undefined, alpha))
  }

  function drawTray(now: number): void {
    state.tray.forEach((p, i) => {
      if (!p || drag?.index === i) return
      const s = L.slots[i]
      const fits = canFit(p)
      // New pieces pop in one after the other.
      const k = ease((now - trayIn - i * 70) / 300)
      drawPiece(p, s.x + s.w / 2, s.y + s.h / 2, L.trayCell * (0.3 + 0.7 * k), fits ? k : 0.4 * k)
    })
    if (drag) {
      const p = state.tray[drag.index]
      if (p) {
        const grow = ease((now - drag.t0) / 120)
        const cell = L.trayCell + (L.cell - L.trayCell) * grow
        drawPiece(p, drag.x, drag.y - drag.lift * grow, cell * (drag.at ? 1 : 0.96), 0.95)
      }
    }
  }

  const canFit = (p: Piece) => {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (canPlace(state.grid, p, r, c)) return true
    return false
  }

  function frame(now: number): void {
    if (!alive) return
    raf = requestAnimationFrame(frame)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, L.W, L.H)
    drawBackground(now)
    ctx.save()
    const st = (now - shake.t0) / 350
    if (st < 1) {
      const a = shake.amp * (1 - st)
      ctx.translate(Math.sin(now / 18) * a, Math.cos(now / 23) * a)
    }
    drawBoard(now)
    drawSweep(now)
    drawPops(now)
    ctx.restore()
    drawTray(now)
    drawParticles()
    drawFloats(now)
    drawHearts(now)
    drawFlyers(now)
    if (save.papa !== false && !papa.flying && now > nextPapa && !drag && !state.over && !overlay.classList.contains('show')) sendPapa()
    // Count the score up smoothly.
    if (shownScore !== state.score) {
      shownScore += Math.max(1, Math.ceil((state.score - shownScore) * 0.15))
      if (shownScore > state.score) shownScore = state.score
      scoreNum.textContent = String(shownScore)
    }
  }

  // ---- Input ----
  function snap(d: Drag): { r: number; c: number } | null {
    const p = state.tray[d.index]
    if (!p) return null
    const { rows, cols } = pieceSize(p)
    const cx = d.x
    const cy = d.y - d.lift
    const fx = (cx - (cols * L.cell) / 2 - L.board.x) / L.cell
    const fy = (cy - (rows * L.cell) / 2 - L.board.y) / L.cell
    // Nearest spot that fits, within a forgiving distance.
    const options: { r: number; c: number; d: number }[] = []
    for (const r of [Math.floor(fy), Math.ceil(fy)]) {
      for (const c of [Math.floor(fx), Math.ceil(fx)]) {
        const dist = Math.hypot(r - fy, c - fx)
        if (dist < 0.85 && canPlace(state.grid, p, r, c)) options.push({ r, c, d: dist })
      }
    }
    options.sort((a, b) => a.d - b.d)
    return options[0] ? { r: options[0].r, c: options[0].c } : null
  }

  /**
   * How far the piece floats above the finger. Full lift over most of the screen, but
   * when the board reaches close to the bottom edge (iPad landscape) the lift fades out
   * near that edge, so the finger can still bring a piece to the bottom row.
   */
  function liftAt(d: Drag): number {
    if (!d.baseLift) return 0
    const lowest = L.H - 14
    // The most lift that still lets the piece's centre reach the bottom row.
    const room = Math.max(0, lowest - (L.board.y + L.board.h - (d.rows * L.cell) / 2))
    if (room >= d.baseLift) return d.baseLift
    const start = lowest - d.baseLift * 2
    const t = Math.min(1, Math.max(0, (d.y - start) / (lowest - start)))
    return d.baseLift + (room - d.baseLift) * t
  }

  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (drag || overlay.classList.contains('show')) return
    const { x, y } = local(e)
    if (papa.hit(x, y)) {
      e.preventDefault()
      popPapa()
      return
    }
    if (state.over) return
    const i = L.slots.findIndex((s) => x >= s.x && x <= s.x + s.w && y >= s.y - 10 && y <= s.y + s.h + 10)
    if (i < 0 || !state.tray[i]) return
    e.preventDefault()
    canvas.setPointerCapture(e.pointerId)
    const p = state.tray[i]!
    const { rows } = pieceSize(p)
    // Lift the piece above the finger so Wyne can see where it goes.
    const baseLift = e.pointerType === 'mouse' ? 0 : rows * L.cell * 0.5 + L.cell * 1.1
    drag = { index: i, pointerId: e.pointerId, x, y, lift: 0, baseLift, rows, t0: performance.now(), at: null }
    drag.lift = liftAt(drag)
    drag.at = snap(drag)
    audio.play('pick')
    kat.hush()
  })

  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    const { x, y } = local(e)
    drag.x = x
    drag.y = y
    drag.lift = liftAt(drag)
    const at = snap(drag)
    if (at && (!drag.at || at.r !== drag.at.r || at.c !== drag.at.c)) audio.play('tap')
    drag.at = at
  })

  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    const d = drag
    drag = null
    if (d.at) drop(d.index, d.at.r, d.at.c)
    else audio.play('drop')
  }
  canvas.addEventListener('pointerup', endDrag)
  canvas.addEventListener('pointercancel', endDrag)

  // ---- Moves ----
  function drop(index: number, r: number, c: number): void {
    const p = state.tray[index]!
    const cells = p.cells.map(([pr, pc]) => [r + pr, c + pc] as [number, number])
    const res = place(state, index, r, c, rng)
    if (!res) return
    const now = performance.now()
    audio.play('place')
    placedFlash = { cells, t0: now }

    const n = res.lines.rows.length + res.lines.cols.length
    const center = cellXY(r + pieceSize(p).rows / 2, c + pieceSize(p).cols / 2)
    if (n > 0) {
      onClear(res.cleared, res.lines, center, now)
      audio.play('clear', n, res.combo)
      const head = n === 1 ? PRAISE[1] : PRAISE[Math.min(4, n)]
      const word = head[Math.floor(Math.random() * head.length)]
      const lines = n === 1 ? '1 rij' : `${n} rijen`
      const sub = res.combo > 1 ? `${res.linePoints} × ${res.combo} = ${res.linePoints * res.combo}` : `+${res.linePoints}`
      floats.push({ text: res.combo > 1 ? `Combo ${res.combo}!` : lines + '!', sub, x: L.board.x + L.board.w / 2, y: L.board.y + L.board.h * 0.42, t0: now, big: true })
      shake = { t0: now, amp: Math.min(10, 2 + n * 2 + res.combo) }
      if (res.boardEmpty) {
        window.setTimeout(() => {
          audio.play('allClear')
          floats.push({ text: 'Alles leeg!', sub: '+300 en 3 💎', x: L.board.x + L.board.w / 2, y: L.board.y + L.board.h * 0.6, t0: performance.now(), big: true })
          for (let i = 0; i < 6; i++) burst(L.board.x + Math.random() * L.board.w, L.board.y + Math.random() * L.board.h, PALETTE[i], 14, 1.4)
        }, 350)
        kat.pose('confetti', 2600)
        kat.say('Alles leeg! Regenboog!', 2600)
        audio.play('meow')
      } else if (n >= 2 || res.combo >= 3) {
        kat.pose('confetti', 1800)
        kat.say(res.combo >= 3 ? `Combo ${res.combo}! Ga zo door!` : word, 1800)
        if (res.combo >= 4 || n >= 3) audio.play('purr')
        else audio.play('meow')
      } else {
        kat.pose('jump', 800)
        kat.say(word, 1300)
      }
      const firstGem = res.cleared.find((x) => x.cell.gem)?.cell.gem
      if (firstGem && n < 2 && res.combo < 3 && Math.random() < 0.5) kat.say(GEM_SAY[firstGem][Math.floor(Math.random() * 2)], 1500)
    } else {
      floats.push({ text: `+${res.points}`, x: center.x, y: center.y, t0: now, big: false })
    }

    // Diamonds from combos and empty boards fly from the middle of the board.
    const fromCells = res.cleared.filter((x) => x.cell.gem).length
    res.gems.slice(fromCells).forEach((gem, i) =>
      flyers.push({ gem, x0: L.board.x + L.board.w / 2, y0: L.board.y + L.board.h / 2, t0: now, delay: 500 + i * 160, dur: 700 }),
    )
    for (const g of res.gems) save.wallet[g] += 1
    updateCombo()
    afterMove()
  }

  function onClear(cleared: ClearedCell[], lines: { rows: number[]; cols: number[] }, from: { x: number; y: number }, now: number): void {
    sweep = { t0: now, lines }
    let gi = 0
    for (const cc of cleared) {
      const { x, y } = cellXY(cc.row, cc.col)
      const delay = Math.hypot(x - from.x, y - from.y) * 0.5
      pops.push({ x, y, color: cc.cell.color, gem: cc.cell.gem, t0: now, delay })
      if (cc.cell.gem) flyers.push({ gem: cc.cell.gem, x0: x + L.cell / 2, y0: y + L.cell / 2, t0: now, delay: delay + 120 + gi++ * 90, dur: 750 })
    }
  }

  function updateCombo(): void {
    comboPill.textContent = state.combo >= 2 ? `🌈 Combo ${state.combo}` : ''
    comboPill.classList.toggle('show', state.combo >= 2)
  }

  function afterMove(): void {
    if (state.score > save.best) {
      save.best = state.score
      best.textContent = `👑 ${state.score}`
    }
    save.game = state
    app.persist()
    if (state.tray.filter(Boolean).length === 3) trayIn = performance.now()
    if (state.over) {
      overTimer = window.setTimeout(() => {
        overTimer = 0
        audio.play('noRoom')
        if (state.rescues === 0) showRescue()
        else showEnd()
      }, 1100)
    }
  }

  // ---- No room: a sum to get help, then the end card ----
  function showRescue(): void {
    const sum = makeSum(rng)
    kat.pose('beg')
    kat.say('Oei! Ik help je!', 0)
    let misses = 0
    const choices = h('div', { class: 'choices' })
    const card = h(
      'div',
      { class: 'card rescue' },
      h('h2', {}, 'Geen plek meer!'),
      h('p', {}, `Weet jij het antwoord? Dan maakt ${pet.name} plek.`),
      h('div', { class: 'sum' }, `${sum.text} = ?`),
      choices,
    )
    for (const n of sum.choices) {
      const b = button(String(n), 'choice', () => {
        if (b.classList.contains('dim')) return
        if (n === sum.answer) {
          audio.play('right')
          b.classList.add('good')
          window.setTimeout(() => {
            hideOverlay()
            doRescue()
          }, 650)
        } else {
          audio.play('wrong')
          misses++
          b.classList.add('dim')
          if (misses >= 2) choices.querySelectorAll('button').forEach((x) => x.textContent === String(sum.answer) && x.classList.add('hint'))
        }
      })
      choices.append(b)
    }
    card.append(button('Stoppen', 'ghost small', () => {
      hideOverlay()
      showEnd()
    }))
    showOverlay(card)
  }

  function doRescue(): void {
    const now = performance.now()
    const cleared = rescue(state, rng)
    const rows = [...new Set(cleared.map((c) => c.row))]
    onClear(cleared, { rows, cols: [] }, { x: L.board.x + L.board.w / 2, y: L.board.y + L.board.h / 2 }, now)
    for (const c of cleared) if (c.cell.gem) save.wallet[c.cell.gem] += 1
    audio.play('clear', 3, 2)
    audio.play('meow')
    kat.pose('confetti', 1800)
    kat.say('Hup! Weer plek!', 1800)
    trayIn = now
    afterMove()
  }

  function showEnd(): void {
    const record = state.score > bestAtStart && bestAtStart > 0
    save.best = Math.max(save.best, state.score)
    save.games += 1
    const got = (Object.keys(state.gemsThisGame) as Gem[]).filter((g) => state.gemsThisGame[g] > 0)
    save.game = null
    app.persist()
    audio.play(record ? 'victory' : 'purr')
    kat.pose(record ? 'confetti' : 'sleep')
    kat.say(record ? 'Nieuw record! Wauw!' : 'Wat heb jij goed gespeeld!', 0)
    const card = h(
      'div',
      { class: 'card end' },
      h('h2', {}, record ? 'Nieuw record!' : `Goed gedaan, ${player.name}!`),
      h('div', { class: 'big-score' }, String(state.score)),
      h('p', {}, record ? `Je vorige record was ${bestAtStart}.` : `Je record is ${save.best}.`),
      got.length
        ? h('div', { class: 'loot' }, h('p', {}, 'Voor het eiland:'), ...got.map((g) => h('span', { class: 'loot-item' }, `${GEM_EMOJI[g]} ${state.gemsThisGame[g]}`)))
        : h('p', {}, 'Ruim blokjes met 🌸 🐚 ⭐ op. Daarmee bouw je het eiland.'),
      h(
        'div',
        { class: 'row' },
        button('Nog een keer', 'primary', () => {
          hideOverlay()
          restart()
        }),
        button('🏝️ Naar het eiland', 'secondary', () => app.go('island')),
      ),
    )
    showOverlay(card)
  }

  function restart(): void {
    state = newGame(rng)
    bestAtStart = save.best
    save.bestBefore = save.best
    save.game = state
    app.persist()
    shownScore = 0
    scoreNum.textContent = '0'
    best.textContent = `👑 ${save.best}`
    trayIn = performance.now()
    updateCombo()
    audio.play('start')
    kat.pose('jump', 700)
    kat.say('Nog een keer! Kom op!', 1600)
  }

  function showOverlay(card: HTMLElement): void {
    overlay.innerHTML = ''
    overlay.append(card)
    overlay.classList.add('show')
  }

  function hideOverlay(): void {
    overlay.classList.remove('show')
    kat.hush()
  }

  // ---- Start ----
  // Turning the iPad: WebKit can fire 'resize' before the new size is laid out, so also
  // watch the element itself and look again a moment after an orientation change.
  const onResize = () => resize()
  const settle = () => [60, 250, 600].forEach((ms) => window.setTimeout(() => alive && resize(), ms))
  const ro = new ResizeObserver(onResize)
  ro.observe(el)
  window.addEventListener('resize', onResize)
  window.addEventListener('orientationchange', settle)
  window.visualViewport?.addEventListener('resize', onResize)
  requestAnimationFrame(() => {
    resize()
    raf = requestAnimationFrame(frame)
    updateCombo()
    if (firstEver) kat.say('Sleep een blokje naar het bord. Maak een rij helemaal vol!', 5000)
    else if (state.score > 0) kat.say('Verder spelen!', 1500)
    else kat.say(`Hoi ${player.name}! Daar gaan we!`, 1800)
    audio.play('start')
    if (state.over) afterMove()
  })

  // Hooks for scripts/screenshots.mjs.
  ;(window as unknown as { __play: unknown }).__play = {
    get state() {
      return state
    },
    get layout() {
      return L
    },
    showRescue,
    showEnd,
    sendPapa,
    /** Lift for a touch drag of a piece this many rows tall, with the finger at y. */
    liftFor: (rows: number, y: number) => liftAt({ baseLift: rows * L.cell * 0.5 + L.cell * 1.1, rows, y } as Drag),
    get papa() {
      return papa.pos
    },
  }

  return {
    el,
    destroy() {
      alive = false
      cancelAnimationFrame(raf)
      window.clearTimeout(overTimer)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', settle)
      window.visualViewport?.removeEventListener('resize', onResize)
      ro.disconnect()
      papa.dispose()
      kat.destroy()
      app.persist()
    },
  }
}
