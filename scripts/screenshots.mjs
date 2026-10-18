#!/usr/bin/env node
/**
 * Plays the built game in headless Chromium at iPad and phone sizes and takes screenshots:
 * menu, play, real drags with line clears and a combo, the rescue sum, the end card and the island.
 * Checks for page errors and horizontal overflow.
 *
 *   npm run build && node scripts/screenshots.mjs
 */
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire('/Users/roelandp/Code/Claude/projects/kit-nugget-klimt/node_modules/')
const { chromium } = require('playwright-core')
const CHROMIUM = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1033/chrome-mac/Chromium.app/Contents/MacOS/Chromium`
const PORT = 4183
const URL = `http://localhost:${PORT}/`
const VIEWPORTS = (process.env.ONLY ? [process.env.ONLY] : ['820x1180', '1180x820', '390x844', '1024x1366']).map((v) => v.split('x').map(Number))

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 1500))
const browser = await chromium.launch({ executablePath: CHROMIUM })
const problems = []
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Drags a tray piece onto the board with real touch events (pointerType "touch", like on the iPad).
 * The game lifts a touched piece above the finger, so the finger ends below the target spot.
 */
async function dragPiece(page, cdp, index, row, col, { release = true } = {}) {
  const pos = await page.evaluate(([i, r, c]) => {
    const { state, layout: L } = window.__play
    const p = state.tray[i]
    const rows = Math.max(...p.cells.map((x) => x[0])) + 1
    const cols = Math.max(...p.cells.map((x) => x[1])) + 1
    const s = L.slots[i]
    // Find the finger height where the lifted piece lands on the target (lift fades near the bottom).
    const target = L.board.y + (r + rows / 2) * L.cell
    let fy = target
    for (let k = 0; k < 20; k++) fy = target + window.__play.liftFor(rows, fy)
    return {
      from: { x: s.x + s.w / 2, y: s.y + s.h / 2 },
      to: { x: L.board.x + (c + cols / 2) * L.cell, y: fy },
    }
  }, [index, row, col])
  const touch = (type, p) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: p.x, y: p.y, id: 1, radiusX: 12, radiusY: 12, force: 1 }] })
  await touch('touchStart', pos.from)
  for (let k = 1; k <= 8; k++) {
    await touch('touchMove', { x: pos.from.x + ((pos.to.x - pos.from.x) * k) / 8, y: pos.from.y + ((pos.to.y - pos.from.y) * k) / 8 })
    await wait(16)
  }
  const end = async () => touch('touchEnd', pos.to)
  if (release) await end()
  return end
}

/** A screen point on the middle of island tile (x, z), found with the scene's own picking. */
async function tilePoint(page, x, z) {
  return page.evaluate(([tx, tz]) => {
    const hits = []
    for (let sy = 0; sy < innerHeight; sy += 6)
      for (let sx = 0; sx < innerWidth; sx += 6) {
        const p = window.__app.scene.pick(sx, sy)
        if (p && p.x === tx && p.z === tz && !window.__app.tapOnCat(sx, sy)) hits.push([sx, sy])
      }
    if (!hits.length) return null
    const ax = hits.reduce((s, h) => s + h[0], 0) / hits.length
    const ay = hits.reduce((s, h) => s + h[1], 0) / hits.length
    return { x: ax, y: ay }
  }, [x, z])
}

for (const [w, h] of VIEWPORTS) {
  const dir = resolve(ROOT, 'screenshots', `${w}x${h}`)
  mkdirSync(dir, { recursive: true })
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: false })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  page.on('pageerror', (e) => problems.push(`${w}x${h} pageerror: ${e.message}`))
  // Headless Chrome cannot decode the GLB's embedded textures (same as in Rainbow Island).
  page.on('console', (m) => m.type() === 'error' && !m.text().includes("Couldn't load texture") && problems.push(`${w}x${h} console: ${m.text()}`))
  await page.goto(URL)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await wait(700)
  const shot = async (name) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.body.scrollHeight > innerHeight + 1)
    if (overflow) problems.push(`${w}x${h} ${name}: overflow`)
    await page.screenshot({ path: `${dir}/${name}.png` })
  }
  await shot('01-menu')
  await page.tap('text=Spelen')
  await wait(900)
  await shot('02-play-start')

  // Set up a board with two nearly full lines so a drag clears them (row 7 and col 0).
  await page.evaluate(() => {
    const { state } = window.__play
    for (let c = 1; c < 8; c++) state.grid[7][c] = { color: c % 7, gem: c === 3 ? 'ster' : c === 5 ? 'bloem' : undefined }
    for (let r = 0; r < 7; r++) state.grid[r][0] = { color: (r + 2) % 7, gem: r === 2 ? 'schelp' : undefined }
    for (let c = 2; c < 6; c++) state.grid[5][c] = { color: 4 }
    state.tray[0] = { id: 900, cells: [[0, 0]], color: 1 }
    state.tray[1] = { id: 901, cells: [[0, 0], [0, 1], [1, 0], [1, 1]], color: 5, gemAt: 0, gem: 'diamant' }
    state.tray[2] = { id: 902, cells: [[0, 0], [0, 1], [0, 2]], color: 3 }
    state.combo = 2
  })
  const up = await dragPiece(page, cdp, 0, 7, 0, { release: false })
  await wait(120)
  await shot('03-drag-preview')
  await up()
  await wait(250)
  await shot('04-clear-combo')
  await wait(1200)
  await shot('05-after-clear')
  await dragPiece(page, cdp, 1, 3, 3)
  await wait(400)
  const st = await page.evaluate(() => ({ score: window.__play.state.score, filled: window.__play.state.grid.flat().filter(Boolean).length }))
  if (st.score !== 95) problems.push(`${w}x${h}: score after combo clear is ${st.score}`)
  // Papa flies over; tap him with a finger
  await page.evaluate(() => window.__play.sendPapa())
  await wait(3600)
  await shot('05b-papa')
  const pp = await page.evaluate(() => window.__play.papa)
  if (!pp) problems.push(`${w}x${h}: Papa is not flying`)
  else {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pp.x, y: pp.y, id: 2 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await wait(700)
    await shot('05c-papa-hearts')
    if (await page.evaluate(() => window.__play.papa)) problems.push(`${w}x${h}: tapping Papa did nothing`)
  }
  await wait(3000)
  await page.evaluate(() => window.__play.showRescue())
  await wait(500)
  await shot('06-rescue')
  // Solve the sum like Wyne would: try until the right one turns green.
  for (const btn of await page.$$('.choice')) {
    await btn.click()
    await wait(150)
    if (await page.$('.choice.good')) break
  }
  await wait(1200)
  await shot('06b-after-rescue')
  if (await page.evaluate(() => document.querySelector('.overlay').classList.contains('show'))) problems.push(`${w}x${h}: rescue card did not close`)

  // Play a whole game with real drags, as long as it lasts (max 80 moves).
  if (w === 820) {
    for (let move = 0; move < 80; move++) {
      const next = await page.evaluate(() => {
        const { state } = window.__play
        if (state.over) return null
        for (let i = 0; i < 3; i++) {
          const p = state.tray[i]
          if (!p) continue
          for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++)
              if (p.cells.every(([pr, pc]) => r + pr < 8 && c + pc < 8 && !state.grid[r + pr][c + pc])) return [i, r, c]
        }
        return null
      })
      if (!next) break
      const before = await page.evaluate(() => window.__play.state.score)
      await dragPiece(page, cdp, ...next)
      await wait(60)
      const after = await page.evaluate(() => window.__play.state.score)
      if (after === before) problems.push(`move ${move} ${next} did not land`)
    }
    await wait(1600)
    await shot('06c-full-game')
  }

  await page.evaluate(() => {
    document.querySelector('.overlay').classList.remove('show')
    window.__play.showEnd()
  })
  await wait(500)
  await shot('07-end')

  // Island with treasure to spend
  await page.evaluate(() => {
    const a = window.__app
    a.save.wallet = { bloem: 40, schelp: 40, ster: 30, diamant: 20 }
    a.persist()
    a.go('island')
  })
  await wait(1500)
  await shot('08-island-empty')
  let placed = 0
  for (const [name, x, z] of [['Gras', 0, 0], ['Zand', 0, 0], ['Bloemen', -1, 0], ['Water', 1, -1], ['Kattenmand', -2, 1], ['Lollyboom', 1, 1], ['Kasteeltorentje', -1, -2], ['Regenboogblok', 1, 0], ['Eenhoorn', 0, 1]]) {
    await page.tap(`.shop-item:has-text("${name}")`)
    await wait(100)
    const pt = await tilePoint(page, x, z)
    if (!pt) {
      problems.push(`${w}x${h}: no screen point for tile ${x},${z}`)
      continue
    }
    await page.evaluate(([px, py]) => window.__island.tapAt(px, py), [pt.x, pt.y])
    placed++
    await wait(150)
  }
  const built = await page.evaluate(() => window.__app.save.island.blocks.length)
  if (built !== placed) problems.push(`${w}x${h}: ${built} things built instead of ${placed}`)
  // On a phone some tiles hide behind Katrien or the shop: fine, as long as most work.
  if (placed < 6) problems.push(`${w}x${h}: only ${placed} tiles could be tapped`)
  await page.tap('.shop-item.land')
  await wait(1500)
  await shot('09-island-built')

  // Players: add Viggo, check the name shows, switch back
  await page.evaluate(() => window.__app.go('menu'))
  await wait(900)
  await shot('10-menu-3d')
  await page.tap('.who')
  await wait(300)
  await page.tap('text=+ Nieuwe speler')
  await wait(300)
  await page.fill('.name-input', 'Viggo')
  await shot('11-new-player')
  await page.tap('.pet:has-text("Kit Nugget")')
  await page.tap('text=Klaar')
  await wait(2500)
  await shot('12-menu-viggo')
  const kitPet = await page.evaluate(() => window.__app.profile.pet)
  if (kitPet !== 'kitnugget') problems.push(`${w}x${h}: Viggo's pet is ${kitPet}`)
  await page.evaluate(() => window.__app.go('island'))
  await wait(1500)
  await shot('12b-island-kitnugget')
  await page.evaluate(() => window.__app.go('menu'))
  await wait(500)
  const who = await page.textContent('.who')
  if (!who.includes('Viggo')) problems.push(`${w}x${h}: player button says ${who}`)
  const viggo = await page.evaluate(() => ({ best: window.__app.save.best, blocks: window.__app.save.island.blocks.length }))
  if (viggo.best !== 0 || viggo.blocks !== 0) problems.push(`${w}x${h}: new player did not start fresh`)
  await page.tap('.who')
  await wait(300)
  await shot('13-players')
  await page.tap('.player:has-text("Wyne")')
  await wait(2500)
  const back = await page.evaluate(() => window.__app.save.island.blocks.length)
  if (back !== built) problems.push(`${w}x${h}: Wyne's island has ${back} things after switching back`)
  await ctx.close()
}

await browser.close()
server.kill()
if (problems.length) {
  console.log('PROBLEMS:\n' + problems.join('\n'))
  process.exit(1)
}
console.log('ok')
