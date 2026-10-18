import { App, button, h, player, WalletBar, type Screen } from '../app'
import { audio } from '../audio'
import { pet } from '../pets'
import { GEM_EMOJI, type Gem } from '../game/board'
import {
  boundsForStep, canAfford, canPlace, ITEMS, itemInfo, landPrice, MAX_STEP, missing, pay, place, PLACE_ERRORS, removeTop,
  type ItemId, type ItemInfo, type Price,
} from '../game/island'

function priceText(p: Price): string {
  return (Object.keys(p) as Gem[]).map((g) => `${p[g]} ${GEM_EMOJI[g]}`).join(' + ')
}

type Tool = ItemId | 'gum'

/**
 * Katrien's island in 3D, built like in Rainbow Island: buy a block or piece of
 * furniture with treasures from the board, tap a tile to put it on top. Blocks
 * stack, furniture turns when tapped, the eraser puts the top one back in the bag.
 * Swipe to turn the island, pinch to zoom, tap Katrien and then a tile to move her.
 */
export function islandScreen(app: App): Screen {
  const save = app.save
  const island = save.island
  const scene = app.scene
  const wallet = new WalletBar(save.wallet)
  let tool: Tool | null = null
  let moveCat = false

  scene.setMood('day')
  scene.catPose('idle')

  const back = button('← Terug', 'pill', () => {
    audio.play('tap')
    app.go('menu')
  })
  const playBtn = button('▶ Spelen', 'pill primary', () => app.go('play'))
  const turnL = button('↺', 'round-btn', () => turn(-1))
  const turnR = button('↻', 'round-btn', () => turn(1))
  const hint = h('div', { class: 'shop-hint' })
  const shop = h('div', { class: 'shop-list' })
  const bubble = h('div', { class: 'bubble island-bubble' })
  const toast = h('div', { class: 'toast' })
  const top = h('header', { class: 'hud' }, back, wallet.el, playBtn)
  const card = h('div', { class: 'shop' }, hint, shop)
  const el = h(
    'div',
    { class: 'screen island see-through' },
    top,
    h('div', { class: 'turns' }, turnL, turnR),
    bubble,
    toast,
    card,
  )

  let bubbleUntil = 0
  let bubbleTimer = 0
  let toastTimer = 0
  let raf = 0
  let alive = true

  function say(text: string, ms = 2200): void {
    window.clearTimeout(bubbleTimer)
    bubble.textContent = text
    bubble.classList.add('show')
    bubbleUntil = performance.now() + ms + 300
    bubbleTimer = window.setTimeout(() => bubble.classList.remove('show'), ms)
  }

  function showToast(text: string, ms = 2400): void {
    window.clearTimeout(toastTimer)
    toast.textContent = text
    toast.classList.add('show')
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), ms)
  }

  // The speech bubble follows Katrien around.
  const follow = () => {
    if (!alive) return
    raf = requestAnimationFrame(follow)
    if (performance.now() > bubbleUntil) return
    const s = app.stage.getBoundingClientRect()
    const c = scene.catScreenPos()
    bubble.style.left = `${s.left + c.x}px`
    bubble.style.top = `${s.top + c.y - 40}px`
  }

  function turn(dir: 1 | -1): void {
    audio.play('tap')
    scene.rotate(dir)
  }

  // ---- Shop ----
  function render(): void {
    shop.innerHTML = ''
    const full = island.step >= MAX_STEP
    const lp = landPrice(island.step)
    const land = h('button', { class: `shop-item land ${!full && canAfford(save.wallet, lp) ? '' : 'cant'}`, type: 'button' })
    land.append(
      h('span', { class: 'emo' }, '🏝️'),
      h('span', { class: 'nm' }, full ? 'Eiland is af!' : 'Meer land'),
      h('span', { class: 'pr' }, full ? '' : priceText(lp)),
    )
    land.addEventListener('click', buyLand)
    shop.append(land)

    const gum = h('button', { class: `shop-item gum ${tool === 'gum' ? 'on' : ''}`, type: 'button' })
    gum.append(h('span', { class: 'emo' }, '🧽'), h('span', { class: 'nm' }, 'Weghalen'), h('span', { class: 'pr' }, 'terug in je tas'))
    gum.addEventListener('click', () => choose('gum'))
    shop.append(gum)

    for (const t of ITEMS) shop.append(shopItem(t))

    if (moveCat) hint.textContent = `Tik op het eiland: waar moet ${pet.name} heen?`
    else if (tool === 'gum') hint.textContent = 'Tik op een blok of meubel om het weg te halen.'
    else if (tool === 'vis') hint.textContent = `Tik op ${pet.name} om ${pet.haar} het visje te geven.`
    else if (tool) hint.textContent = `${itemInfo(tool)?.naam}: tik op het eiland. Blokken kun je stapelen!`
    else hint.textContent = 'Kies iets en tik op het eiland. Veeg om het eiland te draaien. Tik op een meubel om het te draaien.'
  }

  function shopItem(t: ItemInfo): HTMLElement {
    const owned = island.bag[t.id] ?? 0
    const can = canAfford(save.wallet, t.price)
    const b = h('button', { class: `shop-item ${tool === t.id ? 'on' : ''} ${!owned && !can ? 'cant' : ''}`, type: 'button' })
    b.append(
      h('span', { class: 'swatch', style: `background:${t.color}` }, t.icon),
      h('span', { class: 'nm' }, t.naam),
      h('span', { class: 'pr' }, priceText(t.price)),
    )
    if (owned) b.append(h('span', { class: 'badge' }, String(owned)))
    b.addEventListener('click', () => choose(t.id))
    return b
  }

  function choose(t: Tool): void {
    audio.unlock()
    moveCat = false
    if (tool === t) {
      tool = null
      audio.play('tap')
    } else if (t === 'gum' || (island.bag[t] ?? 0) > 0) {
      tool = t
      audio.play('tap')
    } else {
      const info = itemInfo(t)!
      if (pay(save.wallet, info.price)) {
        island.bag[t] = 1
        tool = t
        wallet.sync(save.wallet)
        audio.play('buy')
        say(info.kind === 'treat' ? 'Een visje! Voor mij?' : `${info.icon} Gekocht! Waar moet het staan?`)
        app.persist()
      } else {
        audio.play('wrong')
        showToast(`Nog ${priceText(missing(save.wallet, info.price))} nodig. Speel en ruim ze op!`)
      }
    }
    render()
  }

  function buyLand(): void {
    audio.unlock()
    if (island.step >= MAX_STEP) return
    const lp = landPrice(island.step)
    if (!pay(save.wallet, lp)) {
      audio.play('wrong')
      showToast(`Nog ${priceText(missing(save.wallet, lp))} nodig voor meer land.`)
      return
    }
    island.step += 1
    wallet.sync(save.wallet)
    app.persist()
    audio.play('victory')
    void app.pushIsland(true)
    say('Hoera! Het eiland is groter!')
    render()
  }

  // ---- Taps on the island ----
  function tapAt(x: number, y: number): void {
    audio.unlock()
    if (app.tapOnCat(x, y)) {
      if (tool === 'vis') {
        feed()
        return
      }
      audio.play('meow')
      scene.catJump()
      scene.burst('hearts', 'cat')
      moveCat = !moveCat
      say(moveCat ? 'Waar zal ik heen gaan?' : ['Miauw!', 'Prrr...', 'Wat een mooi eiland!', `Hoi ${player.name}!`][Math.floor(Math.random() * 4)], 1800)
      render()
      return
    }
    const hit = scene.pick(x, y)
    if (moveCat) {
      moveCat = false
      render()
      if (!hit) return
      app.catHoldUntil = Date.now() + 20_000
      audio.play('tap')
      void scene.catWalkTo(hit.x, hit.z)
      return
    }
    if (!hit) return
    const bounds = boundsForStep(island.step)
    if (!tool || tool === 'vis') {
      app.turnFurnitureAt(hit.x, hit.z)
      return
    }
    if (tool === 'gum') {
      const r = removeTop(island.blocks, hit.x, hit.z)
      if (!r) return
      island.blocks = r.blocks
      island.bag[r.removed] = (island.bag[r.removed] ?? 0) + 1
      audio.play('pickup')
      app.persist()
      void app.pushIsland(false)
      render()
      return
    }
    const err = canPlace(island.blocks, bounds, hit.x, hit.z, tool)
    // Tapping furniture turns it, whatever is selected.
    if (err === 'bovenop-meubel' && app.turnFurnitureAt(hit.x, hit.z)) return
    if (err) {
      showToast(PLACE_ERRORS[err])
      return
    }
    const blocks = place(island.blocks, bounds, hit.x, hit.z, tool)
    if (!blocks) return
    island.blocks = blocks
    island.bag[tool] = (island.bag[tool] ?? 1) - 1
    const info = itemInfo(tool)!
    if ((island.bag[tool] ?? 0) <= 0) {
      delete island.bag[tool]
      tool = null
    }
    audio.play('build')
    app.persist()
    void app.pushIsland(false)
    if (info.kind === 'furniture' && Math.random() < 0.7) {
      app.catHoldUntil = Date.now() + 6000
      void scene.catWalkTo(hit.x, hit.z)
      say(info.id === 'mand' ? 'Mijn eigen mandje!' : info.id === 'krabpaal' ? 'Krab krab krab!' : ['Mooi!', 'Wat leuk!', 'Prachtig!'][Math.floor(Math.random() * 3)], 1600)
    }
    render()
  }

  function feed(): void {
    island.bag.vis = (island.bag.vis ?? 1) - 1
    if ((island.bag.vis ?? 0) <= 0) {
      delete island.bag.vis
      tool = null
    }
    app.persist()
    audio.play('purr')
    scene.catPose('happy')
    scene.burst('hearts', 'cat')
    window.setTimeout(() => alive && scene.burst('hearts', 'cat'), 500)
    window.setTimeout(() => alive && scene.catPose('idle'), 2200)
    say('Mmm! Dankjewel!', 2000)
    render()
  }

  const offTap = app.onStageTap(tapAt)
  const unwatch = app.watchInsets(top, card)
  render()
  raf = requestAnimationFrame(follow)
  if (!app.has3d) showToast('Het eiland kan op dit apparaat niet laden.', 6000)
  const hello = window.setTimeout(() => say(island.blocks.length === 0 ? 'Dit is mijn eiland! Wat gaan we bouwen?' : 'Welkom op mijn eiland!', 2400), 600)

  // Hook for scripts/screenshots.mjs.
  ;(window as unknown as { __island: unknown }).__island = { tapAt }

  return {
    el,
    destroy() {
      alive = false
      cancelAnimationFrame(raf)
      window.clearTimeout(bubbleTimer)
      window.clearTimeout(toastTimer)
      window.clearTimeout(hello)
      offTap()
      unwatch()
      app.persist()
    },
  }
}
