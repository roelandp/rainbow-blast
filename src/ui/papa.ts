import * as THREE from 'three'
import { loadOptionalGlb, normalizeModel } from '../scene/glb'
import { animateHelicopter, animatePapa, buildHelicopter, buildPapa } from '../scene/visitors'

const FLIGHT_S = 8

/**
 * Papa (from Kit Nugget Eiland) now and then flies over the board in his helicopter,
 * waving. A transparent WebGL layer on top of the game; it only renders during a flight.
 * Tapping him is handled by the game (hit), which then calls pop().
 */
export class PapaFlyby {
  private renderer: THREE.WebGLRenderer | null = null
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(0, 1, 0, -1, -2000, 2000)
  private readonly rig = new THREE.Group()
  private papa: THREE.Group | null = null
  private heli: THREE.Group | null = null
  private raf = 0
  private t0 = 0
  private dir = 1
  private W = 1
  private H = 1
  private scale = 120
  private yBase = 200
  /** Screen position of Papa during a flight, for tapping. */
  pos: { x: number; y: number } | null = null
  onDone?: () => void

  constructor(private readonly host: HTMLElement) {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      this.renderer = null
      return
    }
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    const cv = this.renderer.domElement
    cv.className = 'papa-layer'
    host.append(cv)
    this.scene.add(new THREE.HemisphereLight('#f4eeff', '#c9e6b8', 2.2))
    const sun = new THREE.DirectionalLight('#fff3e2', 2)
    sun.position.set(200, 400, 300)
    this.scene.add(sun)
    this.scene.add(this.rig)
    this.rig.visible = false

    const heli = buildHelicopter()
    // Papa first gets a stand-in head; the scanned one replaces it when it has loaded.
    this.papa = buildPapa(null)
    ;(heli.userData.seat as THREE.Object3D).add(this.papa)
    this.heli = heli
    this.rig.add(heli)
    void loadOptionalGlb('papa/papa.glb').then((gltf) => {
      if (!gltf || !this.heli) return
      const seat = this.heli.userData.seat as THREE.Object3D
      if (this.papa) seat.remove(this.papa)
      this.papa = buildPapa(normalizeModel(gltf.scene, 0.46))
      seat.add(this.papa)
    })
    this.resize()
  }

  get flying(): boolean {
    return this.pos !== null
  }

  resize(): void {
    if (!this.renderer) return
    this.W = this.host.clientWidth || innerWidth
    this.H = this.host.clientHeight || innerHeight
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(this.W, this.H, false)
    // One world unit is one CSS pixel, y up: screen (x, y) is world (x, -y).
    Object.assign(this.camera, { left: 0, right: this.W, top: 0, bottom: -this.H })
    this.camera.updateProjectionMatrix()
    this.scale = Math.max(90, Math.min(170, Math.min(this.W, this.H) * 0.17))
  }

  /** Starts a flight across the screen at height y (CSS pixels from the top). */
  fly(y: number): void {
    if (!this.renderer || this.flying) return
    this.resize()
    this.dir = Math.random() < 0.5 ? 1 : -1
    this.yBase = y
    this.t0 = performance.now()
    this.rig.visible = true
    this.rig.scale.setScalar(this.scale)
    this.pos = { x: -999, y: -999 }
    cancelAnimationFrame(this.raf)
    this.raf = requestAnimationFrame(this.frame)
  }

  hit(x: number, y: number): boolean {
    if (!this.pos) return false
    return Math.hypot(x - this.pos.x, y - this.pos.y) < this.scale * 0.75
  }

  /** Papa is tapped: he disappears (the game shows the hearts) and the flight ends. */
  pop(): void {
    this.end()
  }

  private end(): void {
    cancelAnimationFrame(this.raf)
    this.rig.visible = false
    this.pos = null
    this.renderer?.render(this.scene, this.camera)
    this.onDone?.()
  }

  private frame = (now: number) => {
    if (!this.renderer || !this.heli || !this.pos) return
    const k = (now - this.t0) / 1000 / FLIGHT_S
    if (k >= 1) {
      this.end()
      return
    }
    this.raf = requestAnimationFrame(this.frame)
    const t = now / 1000
    const margin = this.scale * 1.6
    const x = this.dir > 0 ? -margin + (this.W + margin * 2) * k : this.W + margin - (this.W + margin * 2) * k
    // A gentle wave, and a little hover in the middle so he is easy to tap.
    const y = this.yBase + Math.sin(k * Math.PI * 2) * this.scale * 0.35 + Math.sin(t * 2.4) * 6
    this.rig.position.set(x, -y, 0)
    // Side view from a little above, nose in the direction of flight.
    this.rig.rotation.set(0.35, 0, 0)
    // Yaw first, then the nose dips a little, like a helicopter flying forward.
    this.heli.rotation.order = 'YXZ'
    this.heli.rotation.set(0.18, this.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0)
    animateHelicopter(this.heli, t)
    if (this.papa) {
      animatePapa(this.papa, 'happy', t)
      // Face the player so you can see who it is.
      this.papa.rotation.y = this.dir > 0 ? -Math.PI / 2 : Math.PI / 2
    }
    this.pos = { x, y: y - this.scale * 0.45 }
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.renderer?.dispose()
    this.renderer?.domElement.remove()
  }
}
