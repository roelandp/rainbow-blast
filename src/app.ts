import { audio } from './audio'
import { GEM_EMOJI, GEMS, type Gem } from './game/board'
import { boundsForStep, findItem, itemInfo, sizeForStep, turnTop } from './game/island'
import {
  load, loadProfiles, newProfileId, removeProfileSave, store, storeProfiles, type Profiles, type Save,
} from './game/save'
import { pet, setPet, type PetId } from './pets'
import { IslandScene, type BlockType } from './scene/scene'

/** The current player's name, for everything Katrien says. */
export const player = { name: 'Wyne' }

export interface Screen {
  el: HTMLElement
  destroy?: () => void
}

export type ScreenName = 'menu' | 'play' | 'island'
type Factory = (app: App) => Screen

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v
    else el.setAttribute(k, v)
  }
  for (const c of children) el.append(c)
  return el
}

/** A button that reacts on pointerdown-feel but fires on click, and unlocks audio. */
export function button(label: string, cls: string, onTap: () => void): HTMLButtonElement {
  const b = h('button', { class: `btn ${cls}`, type: 'button' })
  b.innerHTML = label
  b.addEventListener('click', () => {
    audio.unlock()
    onTap()
  })
  return b
}

export type Pose = 'beg' | 'jump' | 'confetti' | 'sleep'
const sprite = (p: Pose) => `${pet.dir}${p}.webp`

/** The player's cat (Katrien or Kit Nugget) as a DOM sprite with a speech bubble. */
export class Katrien {
  el: HTMLElement
  private img: HTMLImageElement
  private bubble: HTMLElement
  private poseTimer = 0
  private bubbleTimer = 0

  constructor(cls = '') {
    this.img = h('img', { src: sprite('beg'), alt: pet.name, draggable: 'false' })
    this.bubble = h('div', { class: 'bubble' })
    this.el = h('div', { class: `katrien ${cls}` }, h('div', { class: 'kat-body' }, this.img), this.bubble)
    this.img.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      audio.unlock()
      audio.play(Math.random() < 0.5 ? 'meow' : 'purr')
      this.pose('jump', 700)
      this.say(['Miauw!', `Hoi ${player.name}!`, 'Prrr...', 'Jij bent lief!', 'Nog een potje?'][Math.floor(Math.random() * 5)], 1600)
    })
  }

  pose(p: Pose, ms = 0, after: Pose = 'beg'): void {
    window.clearTimeout(this.poseTimer)
    this.img.src = sprite(p)
    this.el.dataset.pose = p
    this.el.classList.remove('hop')
    void this.el.offsetWidth
    if (p === 'jump' || p === 'confetti') this.el.classList.add('hop')
    if (ms) this.poseTimer = window.setTimeout(() => this.pose(after), ms)
  }

  say(text: string, ms = 2200): void {
    window.clearTimeout(this.bubbleTimer)
    this.bubble.textContent = text
    this.bubble.classList.add('show')
    if (ms) this.bubbleTimer = window.setTimeout(() => this.bubble.classList.remove('show'), ms)
  }

  hush(): void {
    this.bubble.classList.remove('show')
  }

  destroy(): void {
    window.clearTimeout(this.poseTimer)
    window.clearTimeout(this.bubbleTimer)
  }
}

/** The four treasure counters, used in every screen header. */
export class WalletBar {
  el: HTMLElement
  private nums = new Map<Gem, HTMLElement>()
  private chips = new Map<Gem, HTMLElement>()
  shown: Record<Gem, number>

  constructor(start: Record<Gem, number>) {
    this.shown = { ...start }
    this.el = h('div', { class: 'wallet' })
    for (const g of GEMS) {
      const num = h('b', {}, String(start[g]))
      const chip = h('div', { class: 'chip', 'data-gem': g }, h('span', { class: 'emo' }, GEM_EMOJI[g]), num)
      this.nums.set(g, num)
      this.chips.set(g, chip)
      this.el.append(chip)
    }
  }

  target(g: Gem): { x: number; y: number } {
    const r = this.chips.get(g)!.querySelector('.emo')!.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }

  set(g: Gem, n: number, bump = true): void {
    this.shown[g] = n
    this.nums.get(g)!.textContent = String(n)
    if (bump) {
      const chip = this.chips.get(g)!
      chip.classList.remove('bump')
      void chip.offsetWidth
      chip.classList.add('bump')
    }
  }

  sync(w: Record<Gem, number>): void {
    for (const g of GEMS) this.set(g, w[g], false)
  }
}

/** The bits of the 3D scene the screens use; a stand-in keeps the game playable without WebGL. */
type SceneApi = Pick<
  IslandScene,
  | 'setIslandSize' | 'setBlocks' | 'setProps' | 'setInsets' | 'rotate' | 'setZoom' | 'getZoom' | 'setMood'
  | 'catPose' | 'catJump' | 'catWalkTo' | 'burst' | 'catScreenPos' | 'pick' | 'tiles' | 'pause' | 'resume'
>

function nullScene(): SceneApi {
  return {
    setIslandSize: async () => {},
    setBlocks: () => {},
    setProps: () => {},
    setInsets: () => {},
    rotate: () => {},
    setZoom: () => {},
    getZoom: () => 1,
    setMood: () => {},
    catPose: () => {},
    catJump: () => {},
    catWalkTo: async () => {},
    burst: () => {},
    catScreenPos: () => ({ x: -999, y: -999 }),
    pick: () => null,
    tiles: () => ({ w: 4, d: 4, minX: -2, minZ: -2 }),
    pause: () => {},
    resume: () => {},
  }
}

export class App {
  save: Save
  profiles: Profiles
  readonly stage: HTMLElement
  readonly scene: SceneApi
  readonly has3d: boolean
  /** Katrien stays where she was sent until this time, then roams again. */
  catHoldUntil = 0
  private readonly host: HTMLElement
  private factories = new Map<ScreenName, Factory>()
  private current: Screen | null = null
  private pendingUpdate: (() => void) | null = null
  private stopRoam: (() => void) | null = null
  name: ScreenName = 'menu'

  constructor(mount: HTMLElement) {
    this.profiles = loadProfiles()
    this.save = load(this.profiles.current)
    player.name = this.profile.name
    setPet(this.profile.pet)
    audio.setPet(pet.dir)
    audio.effects = this.save.sound

    this.stage = h('div', { id: 'stage' })
    this.host = h('div', { id: 'screens' })
    mount.append(this.stage, this.host)
    let scene: SceneApi
    let ok = false
    try {
      scene = new IslandScene(this.stage, { base: new URL('./', location.href).href, models: ['katrien'], pet: pet.dir })
      ok = true
    } catch (err) {
      console.warn('[app] no WebGL, island hidden', err)
      scene = nullScene()
    }
    this.scene = scene
    this.has3d = ok
    this.pushIsland(false)
    this.gestures()
  }

  get profile() {
    return this.profiles.list.find((p) => p.id === this.profiles.current) ?? this.profiles.list[0]
  }

  register(name: ScreenName, f: Factory): void {
    this.factories.set(name, f)
  }

  /** Set while the page reloads for another cat: nothing may be saved any more. */
  private reloading = false

  persist(): void {
    if (this.reloading) return
    store(this.profiles.current, this.save)
  }

  private reload(): void {
    this.reloading = true
    location.reload()
  }

  switchProfile(id: string): void {
    this.persist()
    const before = this.profile.pet ?? 'katrien'
    this.profiles.current = id
    storeProfiles(this.profiles)
    this.save = load(id)
    // Another cat on the island: start fresh so the scene loads the other model.
    if ((this.profile.pet ?? 'katrien') !== before) {
      this.reload()
      return
    }
    player.name = this.profile.name
    audio.effects = this.save.sound
    this.pushIsland(false)
  }

  addProfile(name: string, petId: PetId): void {
    const id = newProfileId(name, this.profiles.list.map((p) => p.id))
    this.profiles.list.push({ id, name, pet: petId })
    this.switchProfile(id)
  }

  editProfile(id: string, name: string, petId: PetId): void {
    const p = this.profiles.list.find((x) => x.id === id)
    if (!p) return
    const petChanged = (p.pet ?? 'katrien') !== petId && id === this.profiles.current
    p.name = name
    p.pet = petId
    storeProfiles(this.profiles)
    if (id === this.profiles.current) player.name = name
    if (petChanged) {
      this.persist()
      this.reload()
    }
  }

  deleteProfile(id: string): void {
    if (this.profiles.list.length <= 1) return
    this.profiles.list = this.profiles.list.filter((p) => p.id !== id)
    removeProfileSave(id)
    if (this.profiles.current === id) this.switchProfile(this.profiles.list[0].id)
    else storeProfiles(this.profiles)
  }

  go(name: ScreenName): void {
    this.current?.destroy?.()
    this.host.innerHTML = ''
    this.name = name
    const f = this.factories.get(name)
    if (!f) return
    // The game board covers everything: stop the 3D scene to save battery.
    const showScene = name !== 'play'
    this.stage.style.visibility = showScene ? 'visible' : 'hidden'
    if (showScene) this.scene.resume()
    else this.scene.pause()
    this.stopRoam?.()
    this.stopRoam = showScene ? this.roam() : null
    this.current = f(this)
    this.host.append(this.current.el)
    if (name === 'menu' && this.pendingUpdate) {
      const run = this.pendingUpdate
      this.pendingUpdate = null
      run()
    }
  }

  /** A new version is ready: apply it on the start screen, never mid-game. */
  updateReady(apply: () => void): void {
    if (this.name === 'menu') apply()
    else this.pendingUpdate = apply
  }

  // ---------- island ----------

  /** Pushes island size and everything built on it to the scene. */
  pushIsland(grow: boolean): Promise<void> {
    const { w, d } = sizeForStep(this.save.island.step)
    const p = this.scene.setIslandSize(w, d, grow)
    const placed = this.save.island.blocks.filter((b) => {
      const bd = boundsForStep(this.save.island.step)
      return b.x >= bd.minX && b.x < bd.minX + bd.w && b.z >= bd.minZ && b.z < bd.minZ + bd.d
    })
    this.scene.setBlocks(
      placed.filter((b) => itemInfo(b.type)?.kind === 'block').map((b) => ({ x: b.x, z: b.z, y: b.y, type: b.type as BlockType })),
    )
    this.scene.setProps(
      placed.filter((b) => itemInfo(b.type)?.kind === 'furniture').map((b) => ({ x: b.x, z: b.z, y: b.y, type: b.type, rot: b.rot ?? 0 })),
    )
    return p
  }

  turnFurnitureAt(x: number, z: number): boolean {
    const turned = turnTop(this.save.island.blocks, x, z)
    if (!turned) return false
    this.save.island.blocks = turned
    this.persist()
    audio.play('build')
    this.pushIsland(false)
    return true
  }

  /** Whether a tap at client coordinates lands on Katrien. */
  tapOnCat(clientX: number, clientY: number): boolean {
    const s = this.stage.getBoundingClientRect()
    const c = this.scene.catScreenPos()
    const dx = clientX - s.left - c.x
    const dy = clientY - s.top - c.y
    // catScreenPos is the head; the body hangs below it.
    return Math.abs(dx) < 70 && dy > -60 && dy < 110
  }

  /** Katrien wanders over the island: to a random tile, now and then to her post or bowl. */
  private roam(): () => void {
    let stopped = false
    let timer = 0
    const schedule = (ms: number) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(step, ms)
    }
    const step = async () => {
      if (stopped) return
      if (Date.now() < this.catHoldUntil) {
        schedule(this.catHoldUntil - Date.now() + 500)
        return
      }
      const blocks = this.save.island.blocks
      const t = this.scene.tiles()
      const r = Math.random()
      const post = findItem(blocks, 'krabpaal')
      const bowl = findItem(blocks, 'voerbak')
      if (post && r < 0.2) {
        await this.scene.catWalkTo(post.x, post.z)
        if (!stopped) this.scene.catJump()
      } else if (bowl && r < 0.4) {
        await this.scene.catWalkTo(bowl.x, bowl.z)
        if (!stopped) {
          this.scene.catPose('happy')
          window.setTimeout(() => !stopped && this.scene.catPose('idle'), 1500)
        }
      } else {
        await this.scene.catWalkTo(t.minX + Math.floor(Math.random() * t.w), t.minZ + Math.floor(Math.random() * t.d))
      }
      if (!stopped) schedule(3500 + Math.random() * 4000)
    }
    schedule(2500)
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }

  /** Swipe sideways to turn the island a quarter, pinch (or trackpad) to zoom. */
  private gestures(): void {
    const active = new Map<number, { x: number; y: number; t: number }>()
    const now = new Map<number, { x: number; y: number }>()
    let multi = false
    let pinchStart = 0
    let zoomStart = 1
    const spread = () => {
      const [a, b] = [...now.values()]
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
    }
    this.stage.addEventListener('pointerdown', (e) => {
      active.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() })
      now.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (active.size > 1) {
        multi = true
        pinchStart = spread()
        zoomStart = this.scene.getZoom()
      }
    })
    window.addEventListener('pointermove', (e) => {
      if (!now.has(e.pointerId)) return
      now.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (now.size === 2 && pinchStart > 0) this.scene.setZoom(zoomStart * (spread() / pinchStart))
    })
    this.stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const k = e.ctrlKey ? 0.012 : 0.0015
        this.scene.setZoom(this.scene.getZoom() * Math.exp(-e.deltaY * k))
      },
      { passive: false },
    )
    const end = (e: PointerEvent) => {
      now.delete(e.pointerId)
      if (now.size < 2) pinchStart = 0
      const start = active.get(e.pointerId)
      active.delete(e.pointerId)
      const wasMulti = multi
      if (active.size === 0) multi = false
      if (!start || wasMulti || e.type === 'pointercancel') return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4 && performance.now() - start.t < 800) {
        audio.play('tap')
        this.scene.rotate(dx > 0 ? -1 : 1)
      }
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  /** Calls handler for short taps on the scene (not swipes or pinches). */
  onStageTap(handler: (x: number, y: number) => void): () => void {
    let start: { x: number; y: number; t: number; id: number } | null = null
    const down = (e: PointerEvent) => {
      start = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : null
    }
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y)
      const quick = performance.now() - start.t < 600
      start = null
      if (moved < 12 && quick) handler(e.clientX, e.clientY)
    }
    this.stage.addEventListener('pointerdown', down)
    this.stage.addEventListener('pointerup', up)
    return () => {
      this.stage.removeEventListener('pointerdown', down)
      this.stage.removeEventListener('pointerup', up)
    }
  }

  /** Tells the scene which parts of the screen are covered, so the island is framed in the free space. */
  watchInsets(top: HTMLElement | null, bottom: HTMLElement | null): () => void {
    const measure = () => {
      const stage = this.stage.getBoundingClientRect()
      const t = top ? Math.max(0, top.getBoundingClientRect().bottom - stage.top) : 0
      const b = bottom ? Math.max(0, stage.bottom - bottom.getBoundingClientRect().top) : 0
      this.scene.setInsets(t, b)
    }
    const ro = new ResizeObserver(measure)
    if (top) ro.observe(top)
    if (bottom) ro.observe(bottom)
    window.addEventListener('resize', measure)
    requestAnimationFrame(measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }
}
