export type Voice =
  | 'pick'
  | 'place'
  | 'drop'
  | 'clear'
  | 'gem'
  | 'allClear'
  | 'noRoom'
  | 'right'
  | 'wrong'
  | 'buy'
  | 'build'
  | 'pickup'
  | 'tap'
  | 'start'
  | 'victory'
  | 'purr'
  | 'meow'
  | 'heli'
  | 'pop'

const EFFECT_GAIN = 0.5

/** Recordings from Rainbow Island and Kit Nugget Eiland (meows and purr per pet); the synth fills in otherwise. */
const SAMPLES: Record<string, string> = {
  correct: 'sounds/game-correct.mp3',
  victory: 'sounds/game-victory.mp3',
  start: 'sounds/game-gamestart.mp3',
  purr: 'pets/katrien/purr.mp3',
  'meow-1': 'pets/katrien/meow-1.mp3',
  'meow-2': 'pets/katrien/meow-2.mp3',
}

// A major pentatonic scale: any run of these notes sounds happy.
const PENTA = [0, 2, 4, 7, 9]
const note = (step: number, base = 523.25) => base * Math.pow(2, (Math.floor(step / 5) * 12 + PENTA[((step % 5) + 5) % 5]) / 12)

/**
 * WebAudio synth plus a few real recordings. Everything is short and friendly:
 * "no room" is a soft falling sigh, never a buzzer.
 */
export class Audio {
  private ctx: AudioContext | null = null
  private bus: GainNode | null = null
  private samples = new Map<string, AudioBuffer>()
  private loading = new Set<string>()
  private lastMeow = 0

  effects = true

  /** Meows and purr come from the current pet's folder. */
  setPet(dir: string): void {
    for (const n of ['purr', 'meow-1', 'meow-2']) {
      if (SAMPLES[n] === `${dir}${n}.mp3`) continue
      SAMPLES[n] = `${dir}${n}.mp3`
      this.samples.delete(n)
      void this.load(n)
    }
  }

  /** Must run inside a user gesture on iOS. Safe to call repeatedly. */
  unlock(): void {
    // "playback" makes sound come out with the iOS silent switch flipped.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (session && session.type !== 'playback') {
      try {
        session.type = 'playback'
      } catch {
        // Not settable here; the rest still works when unmuted.
      }
    }
    if (this.ctx) {
      // iOS reports 'interrupted' after a call, Siri or a locked screen.
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    this.bus = this.ctx.createGain()
    this.bus.gain.value = EFFECT_GAIN
    this.bus.connect(this.ctx.destination)
    for (const name of Object.keys(SAMPLES)) void this.load(name)
  }

  private async load(name: string): Promise<void> {
    if (!this.ctx || this.samples.has(name) || this.loading.has(name)) return
    this.loading.add(name)
    try {
      const res = await fetch(SAMPLES[name])
      if (!res.ok) return
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer())
      this.samples.set(name, buf)
    } catch {
      // Missing or undecodable: the synth covers it.
    } finally {
      this.loading.delete(name)
    }
  }

  private tone(freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine', bend = 0): void {
    if (!this.ctx || !this.bus) return
    const t = this.ctx.currentTime + start
    const osc = this.ctx.createOscillator()
    const env = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (bend) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + bend), t + dur)
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(gain, t + 0.012)
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(env).connect(this.bus)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  private shot(name: string, gain = 0.7, rate = 1): boolean {
    const buf = this.samples.get(name)
    if (!buf || !this.ctx || !this.bus) return false
    const src = this.ctx.createBufferSource()
    const env = this.ctx.createGain()
    env.gain.value = gain
    src.buffer = buf
    src.playbackRate.value = rate
    src.connect(env).connect(this.bus)
    src.start()
    return true
  }

  /** n: lines cleared (for 'clear'), combo step otherwise. */
  play(voice: Voice, n = 0, combo = 0): void {
    if (!this.effects) return
    this.unlock()
    if (!this.ctx) return
    switch (voice) {
      case 'pick':
        this.tone(660, 0, 0.06, 0.08, 'sine', 120)
        break
      case 'place':
        this.tone(200, 0, 0.1, 0.22, 'triangle', 60)
        this.tone(600, 0.015, 0.06, 0.06, 'sine')
        break
      case 'drop':
        // Back to the tray: a soft little slide down.
        this.tone(420, 0, 0.12, 0.08, 'sine', -160)
        break
      case 'clear': {
        // Higher and longer with more lines and a bigger combo.
        const start = Math.min(combo, 8) * 2
        const count = 3 + Math.min(n, 4) * 2
        for (let i = 0; i < count; i++) this.tone(note(start + i), i * 0.055, 0.22, 0.12, i % 2 ? 'sine' : 'triangle')
        if (n >= 2) this.tone(note(start + count + 2, 261.6), count * 0.055, 0.5, 0.1, 'triangle')
        break
      }
      case 'gem':
        this.tone(1568, 0, 0.12, 0.07, 'sine')
        this.tone(2093, 0.05, 0.18, 0.06, 'sine')
        break
      case 'allClear':
        if (!this.shot('victory', 0.55)) {
          ;[523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, i * 0.1, 0.4, 0.14, 'triangle'))
        }
        break
      case 'noRoom':
        this.tone(440, 0, 0.3, 0.1, 'sine', -120)
        this.tone(330, 0.25, 0.45, 0.1, 'sine', -80)
        break
      case 'right':
        if (!this.shot('correct', 0.55)) {
          this.tone(660, 0, 0.14, 0.18, 'triangle')
          this.tone(990, 0.09, 0.22, 0.16, 'sine')
        }
        break
      case 'wrong':
        // A soft two-note question, rising at the end. No buzzer, no sting.
        this.tone(300, 0, 0.13, 0.13, 'sine')
        this.tone(380, 0.12, 0.2, 0.13, 'sine', 40)
        break
      case 'buy':
        for (let i = 0; i < 4; i++) this.tone(900 + i * 240, i * 0.05, 0.2, 0.08, 'sine')
        break
      case 'build':
        this.tone(260, 0, 0.12, 0.2, 'triangle', 90)
        ;[784, 1047].forEach((f, i) => this.tone(f, 0.06 + i * 0.07, 0.18, 0.07, 'sine'))
        break
      case 'pickup':
        this.tone(480, 0, 0.1, 0.12, 'triangle', 200)
        break
      case 'tap':
        this.tone(520, 0, 0.04, 0.07, 'sine')
        break
      case 'start':
        if (!this.shot('start', 0.4)) this.tone(523, 0, 0.2, 0.14, 'triangle')
        break
      case 'victory':
        if (!this.shot('victory', 0.5)) {
          ;[523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.11, 0.3, 0.16, 'triangle'))
        }
        break
      case 'purr':
        if (!this.shot('purr', 0.7)) this.tone(90, 0, 0.6, 0.1, 'sawtooth')
        break
      case 'heli':
        // A soft whirr that comes closer and goes away again.
        for (let i = 0; i < 26; i++) this.tone(95 + (i % 2) * 8, i * 0.12, 0.09, 0.03 + 0.05 * Math.sin((i / 26) * Math.PI), 'triangle')
        break
      case 'pop':
        this.tone(160, 0, 0.3, 0.25, 'triangle', 260)
        for (let i = 0; i < 6; i++) this.tone(note(10 + i * 2), 0.05 + i * 0.05, 0.22, 0.08, 'sine')
        break
      case 'meow': {
        this.lastMeow = this.lastMeow === 1 ? 2 : 1
        if (!this.shot(`meow-${this.lastMeow}`, 0.75, 0.95 + Math.random() * 0.15)) {
          this.tone(440, 0, 0.22, 0.14, 'triangle', 120)
          this.tone(560, 0.18, 0.3, 0.12, 'sine', -80)
        }
        break
      }
    }
  }
}

export const audio = new Audio()
