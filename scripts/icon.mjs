#!/usr/bin/env node
// Renders the app icon (Katrien and Kit Nugget on rainbow blocks) to public/misc at 512, 192 and 180 px.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire('/Users/roelandp/Code/Claude/projects/kit-nugget-klimt/node_modules/')
const { chromium } = require('playwright-core')
const CHROMIUM = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1033/chrome-mac/Chromium.app/Contents/MacOS/Chromium`

const b64 = (f) => 'data:image/webp;base64,' + readFileSync(resolve(ROOT, f)).toString('base64')
const katrien = b64('public/pets/katrien/beg.webp')
const kit = b64('public/pets/kitnugget/beg.webp')
const html = (size) => `<!doctype html><html><body style="margin:0">
<canvas id="c" width="${size}" height="${size}"></canvas>
<script>
{
const s = ${size}, c = document.getElementById('c'), g = c.getContext('2d')
const bg = g.createLinearGradient(0, 0, 0, s)
bg.addColorStop(0, '#d6c4fa'); bg.addColorStop(0.55, '#f5c4ec'); bg.addColorStop(1, '#b8dcfa')
g.fillStyle = bg; g.fillRect(0, 0, s, s)
const cols = ['#ff5d8f', '#ff9a3d', '#ffd23f', '#4fd17a', '#38c6e6', '#5b8cff', '#a66bff']
const b = s * 0.13
function block(x, y, col) {
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.roundRect(x, y + b*0.06, b, b, b*0.2); g.fill()
  const gr = g.createLinearGradient(0, y, 0, y + b); gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, col); gr.addColorStop(1, col)
  g.fillStyle = gr; g.beginPath(); g.roundRect(x, y, b, b * 0.94, b*0.2); g.fill()
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.roundRect(x + b*0.18, y + b*0.12, b*0.42, b*0.14, b*0.07); g.fill()
}
// A rainbow row of blocks along the bottom, inside the maskable safe zone.
const y0 = s * 0.66
for (let i = 0; i < 6; i++) block(s * 0.11 + i * b * 1.02, y0, cols[i])
for (let i = 0; i < 2; i++) block(s * 0.11 + i * b * 1.02, y0 - b * 1.02, cols[6 - i])
block(s * 0.11 + 5 * b * 1.02, y0 - b * 1.02, cols[4])
const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src })
Promise.all([load('${katrien}'), load('${kit}')]).then(([a, k]) => {
  // Katrien left, Kit Nugget right, both standing on the blocks.
  const h = s * 0.56
  const wa = h * a.width / a.height, wk = h * k.width / k.height
  g.drawImage(k, s * 0.64 - wk / 2, s * 0.16, wk, h)
  g.drawImage(a, s * 0.37 - wa / 2, s * 0.15, wa, h)
  document.title = 'done'
})
}
</script></body></html>`

const browser = await chromium.launch({ executablePath: CHROMIUM })
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('ERR', e.message))
for (const [size, name] of [[512, 'icon-512.png'], [192, 'icon-192.png'], [180, 'apple-touch-icon.png']]) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(html(size))
  await page.waitForFunction(() => document.title === 'done')
  await page.locator('#c').screenshot({ path: resolve(ROOT, 'public/misc', name) })
}
await browser.close()
console.log('icons written')
