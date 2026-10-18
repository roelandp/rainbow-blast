import type { GameState } from './board'
import { newIsland, type IslandState, type Wallet } from './island'

const LEGACY_KEY = 'rainbow-blast.v1'
const PROFILES_KEY = 'rainbow-blast.profiles'
const profileKey = (id: string) => `rainbow-blast.p.${id}`

export interface Save {
  version: 2
  best: number
  /** The record when the current game started, so the end card can say "new record". */
  bestBefore?: number
  games: number
  wallet: Wallet
  island: IslandState
  game: GameState | null
  sound: boolean
}

export interface Profile {
  id: string
  name: string
  /** Which cat this player plays with (default Katrien). */
  pet?: 'katrien' | 'kitnugget'
}

export interface Profiles {
  current: string
  list: Profile[]
}

export function freshSave(): Save {
  return {
    version: 2,
    best: 0,
    games: 0,
    wallet: { bloem: 0, schelp: 0, ster: 0, diamant: 0 },
    island: newIsland(),
    game: null,
    sound: true,
  }
}

// What the first (flat, emoji) island cost; its things are paid back when it is replaced.
const OLD_PRICES: Record<string, Partial<Wallet>> = {
  tulp: { bloem: 2 }, zonnebloem: { bloem: 3 }, paddenstoel: { schelp: 2 }, boom: { bloem: 4 },
  palm: { bloem: 3, schelp: 2 }, water: { schelp: 3 }, zand: { schelp: 2 }, pad: { bloem: 1 },
  wol: { schelp: 3 }, mand: { schelp: 4, bloem: 2 }, vis: { schelp: 5 }, kuiken: { ster: 2 },
  konijn: { ster: 3 }, eend: { ster: 3, schelp: 2 }, huisje: { ster: 5, bloem: 5 }, tent: { ster: 4 },
  taart: { ster: 3, bloem: 3 }, fontein: { diamant: 2, schelp: 4 }, eenhoorn: { diamant: 3 },
  regenboog: { diamant: 3, ster: 3 }, draaimolen: { diamant: 4, ster: 5 }, kasteel: { diamant: 6, ster: 6 },
}

function migrate(data: Record<string, unknown>): Save {
  const base = freshSave()
  const wallet = { ...base.wallet, ...(data.wallet as Partial<Wallet>) }
  let island = data.island as IslandState & { placed?: Record<string, string>; size?: number }
  if (!island || !Array.isArray(island.blocks)) {
    // Version 1 island: refund everything that was bought, plus the land.
    const old = island ?? {}
    const things = [...Object.values(old.placed ?? {}), ...Object.entries(old.bag ?? {}).flatMap(([id, n]) => Array(n ?? 0).fill(id))]
    for (const id of things) for (const [g, n] of Object.entries(OLD_PRICES[id] ?? {})) wallet[g as keyof Wallet] += n ?? 0
    for (let s = 4; s < (old.size ?? 4); s++) wallet.schelp += 6 + 3 * (s - 4)
    island = newIsland()
  }
  return { ...base, ...(data as Partial<Save>), version: 2, wallet, island: { ...newIsland(), ...island } }
}

function read(key: string): Save | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? migrate(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode or full storage: the game keeps going, it just will not remember.
  }
}

export function loadProfiles(): Profiles {
  try {
    const raw = localStorage.getItem(PROFILES_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Profiles
      if (p.list?.length) return p
    }
  } catch {
    // fall through to a fresh list
  }
  // First start (or a save from before profiles): one player, Wyne.
  const profiles: Profiles = { current: 'wyne', list: [{ id: 'wyne', name: 'Wyne', pet: 'katrien' }] }
  const legacy = read(LEGACY_KEY)
  if (legacy) write(profileKey('wyne'), legacy)
  write(PROFILES_KEY, profiles)
  return profiles
}

export function storeProfiles(p: Profiles): void {
  write(PROFILES_KEY, p)
}

export function load(id: string): Save {
  return read(profileKey(id)) ?? freshSave()
}

export function store(id: string, s: Save): void {
  write(profileKey(id), s)
}

export function removeProfileSave(id: string): void {
  try {
    localStorage.removeItem(profileKey(id))
  } catch {
    // nothing to clean up
  }
}

export function newProfileId(name: string, taken: string[]): string {
  const slug = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 16) || 'speler'
  let id = slug
  for (let i = 2; taken.includes(id); i++) id = `${slug}${i}`
  return id
}
