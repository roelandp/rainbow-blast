import type { Gem } from './board'

/** Building blocks and furniture from Rainbow Island, bought with treasures from the board. */
export type BlockId = 'gras' | 'zand' | 'steen' | 'hout' | 'water' | 'bloemen' | 'regenboog' | 'roze' | 'lila' | 'mint'
export type FurnitureId =
  | 'mand'
  | 'krabpaal'
  | 'voerbak'
  | 'lantaarn'
  | 'bankje'
  | 'boompje'
  | 'hek'
  | 'vuurtoren'
  | 'hartjeslamp'
  | 'eenhoorn'
  | 'hemelbed'
  | 'regenboogboog'
  | 'lollyboom'
  | 'kasteeltoren'
export type ItemId = BlockId | FurnitureId | 'vis'

export type Price = Partial<Record<Gem, number>>

export interface ItemInfo {
  id: ItemId
  naam: string
  kind: 'block' | 'furniture' | 'treat'
  icon: string
  /** Swatch background in the shop (a colour or a CSS gradient). */
  color: string
  price: Price
}

const RAINBOW = 'linear-gradient(180deg, #ffb3c1, #ffd3a8, #fff1a8, #c4ecb8, #b8dcfa, #d6c4fa)'

export const ITEMS: ItemInfo[] = [
  { id: 'gras', naam: 'Gras', kind: 'block', icon: '🟩', color: '#a6dc8c', price: { bloem: 1 } },
  { id: 'bloemen', naam: 'Bloemen', kind: 'block', icon: '🌸', color: '#f6b8d0', price: { bloem: 2 } },
  { id: 'zand', naam: 'Zand', kind: 'block', icon: '🟨', color: '#f2dca6', price: { schelp: 1 } },
  { id: 'water', naam: 'Water', kind: 'block', icon: '🟦', color: '#8fd0ee', price: { schelp: 2 } },
  { id: 'steen', naam: 'Steen', kind: 'block', icon: '⬜', color: '#c9c5cf', price: { schelp: 2 } },
  { id: 'hout', naam: 'Hout', kind: 'block', icon: '🟫', color: '#d9a46c', price: { bloem: 2 } },
  { id: 'roze', naam: 'Roze blok', kind: 'block', icon: '🩷', color: '#ffc4dc', price: { ster: 1 } },
  { id: 'lila', naam: 'Lila blok', kind: 'block', icon: '💜', color: '#d7c6f7', price: { ster: 1 } },
  { id: 'mint', naam: 'Mint blok', kind: 'block', icon: '💚', color: '#bfeedd', price: { ster: 1 } },
  { id: 'regenboog', naam: 'Regenboogblok', kind: 'block', icon: '🌈', color: RAINBOW, price: { ster: 2 } },
  { id: 'vis', naam: 'Visje', kind: 'treat', icon: '🐟', color: '#d7eefb', price: { schelp: 2 } },
  { id: 'hek', naam: 'Hekje', kind: 'furniture', icon: '🚧', color: '#f4efe9', price: { bloem: 2 } },
  { id: 'voerbak', naam: 'Voerbak', kind: 'furniture', icon: '🥣', color: '#9ec9f0', price: { schelp: 3 } },
  { id: 'mand', naam: 'Kattenmand', kind: 'furniture', icon: '🧺', color: '#e8b27a', price: { schelp: 3, bloem: 2 } },
  { id: 'krabpaal', naam: 'Krabpaal', kind: 'furniture', icon: '🪵', color: '#d9b48c', price: { bloem: 4 } },
  { id: 'boompje', naam: 'Boompje', kind: 'furniture', icon: '🌳', color: '#7cc47f', price: { bloem: 4 } },
  { id: 'bankje', naam: 'Bankje', kind: 'furniture', icon: '🪑', color: '#c98f5b', price: { bloem: 3, schelp: 2 } },
  { id: 'lantaarn', naam: 'Lantaarn', kind: 'furniture', icon: '🏮', color: '#ffd27d', price: { ster: 3 } },
  { id: 'hartjeslamp', naam: 'Hartjeslamp', kind: 'furniture', icon: '💖', color: '#ffc4dc', price: { ster: 4 } },
  { id: 'lollyboom', naam: 'Lollyboom', kind: 'furniture', icon: '🍭', color: '#ffe0f0', price: { ster: 3, bloem: 3 } },
  { id: 'eenhoorn', naam: 'Eenhoorn', kind: 'furniture', icon: '🦄', color: '#f3e8ff', price: { diamant: 3 } },
  { id: 'hemelbed', naam: 'Prinsessenbed', kind: 'furniture', icon: '🛏️', color: '#f9d3e6', price: { ster: 4, diamant: 2 } },
  { id: 'regenboogboog', naam: 'Regenboog', kind: 'furniture', icon: '🌈', color: '#e0f2ff', price: { diamant: 3, ster: 2 } },
  { id: 'kasteeltoren', naam: 'Kasteeltorentje', kind: 'furniture', icon: '🏰', color: '#f7c6dc', price: { diamant: 5, ster: 4 } },
  { id: 'vuurtoren', naam: 'Vuurtorentje', kind: 'furniture', icon: '🗼', color: '#f28b82', price: { diamant: 6, ster: 6 } },
]

export function itemInfo(id: string): ItemInfo | undefined {
  return ITEMS.find((i) => i.id === id)
}

/** Highest stack, counted in layers above the ground. */
export const MAX_LAYERS = 6
export const MAX_STEP = 16

/** Island size per "more land" step: 4x4, 5x4, 5x5, ... up to 12x12. */
export function sizeForStep(step: number): { w: number; d: number } {
  const s = Math.max(0, Math.min(MAX_STEP, step))
  return { w: 4 + Math.ceil(s / 2), d: 4 + Math.floor(s / 2) }
}

/** More land gets a little dearer each time: 5, 7, 9, ... shells. */
export function landPrice(step: number): Price {
  return { schelp: 5 + 2 * step }
}

export interface PlacedBlock {
  x: number
  z: number
  /** Layer above the ground: layer k occupies world y in [k, k + 1]. */
  y: number
  type: ItemId
  /** Quarter turns, furniture only. */
  rot?: number
}

export interface IslandState {
  step: number
  blocks: PlacedBlock[]
  /** Bought and not (or no longer) on the island. */
  bag: Partial<Record<ItemId, number>>
}

export function newIsland(): IslandState {
  return { step: 0, blocks: [], bag: {} }
}

export interface Bounds {
  minX: number
  minZ: number
  w: number
  d: number
}

/** Same footprint rule as the scene: existing tiles never move when the island grows. */
export function boundsForStep(step: number): Bounds {
  const { w, d } = sizeForStep(step)
  return { minX: -Math.floor(w / 2), minZ: -Math.floor(d / 2), w, d }
}

export function inBounds(b: Bounds, x: number, z: number): boolean {
  return x >= b.minX && x < b.minX + b.w && z >= b.minZ && z < b.minZ + b.d
}

export function column(blocks: PlacedBlock[], x: number, z: number): PlacedBlock[] {
  return blocks.filter((b) => b.x === x && b.z === z).sort((a, b) => a.y - b.y)
}

export function height(blocks: PlacedBlock[], x: number, z: number): number {
  const col = column(blocks, x, z)
  return col.length ? col[col.length - 1].y + 1 : 0
}

export type PlaceError = 'buiten' | 'te-hoog' | 'bovenop-meubel' | 'bovenop-water'

export const PLACE_ERRORS: Record<PlaceError, string> = {
  buiten: 'Dat is in het water. Bouw op het eiland!',
  'te-hoog': 'Hoger gaat niet, anders valt het om.',
  'bovenop-meubel': 'Op een meubel kan niks meer.',
  'bovenop-water': 'Op water kan niks blijven liggen.',
}

export function canPlace(blocks: PlacedBlock[], bounds: Bounds, x: number, z: number, type: ItemId): PlaceError | null {
  if (!inBounds(bounds, x, z)) return 'buiten'
  const col = column(blocks, x, z)
  const top = col[col.length - 1]
  if (top && itemInfo(top.type)?.kind === 'furniture') return 'bovenop-meubel'
  if (top && top.type === 'water') return 'bovenop-water'
  const h = top ? top.y + 1 : 0
  const tall = type === 'vuurtoren' ? 2 : 1
  if (h + tall > MAX_LAYERS) return 'te-hoog'
  return null
}

export function place(blocks: PlacedBlock[], bounds: Bounds, x: number, z: number, type: ItemId): PlacedBlock[] | null {
  if (canPlace(blocks, bounds, x, z, type)) return null
  return [...blocks, { x, z, y: height(blocks, x, z), type }]
}

export function removeTop(blocks: PlacedBlock[], x: number, z: number): { blocks: PlacedBlock[]; removed: ItemId } | null {
  const col = column(blocks, x, z)
  const top = col[col.length - 1]
  if (!top) return null
  return { blocks: blocks.filter((b) => b !== top), removed: top.type }
}

export function turnTop(blocks: PlacedBlock[], x: number, z: number): PlacedBlock[] | null {
  const col = column(blocks, x, z)
  const top = col[col.length - 1]
  if (!top || itemInfo(top.type)?.kind !== 'furniture') return null
  return blocks.map((b) => (b === top ? { ...b, rot: ((b.rot ?? 0) + 1) % 4 } : b))
}

export function findItem(blocks: PlacedBlock[], type: ItemId): PlacedBlock | undefined {
  return blocks.find((b) => b.type === type)
}

export type Wallet = Record<Gem, number>

export function canAfford(w: Wallet, price: Price): boolean {
  return (Object.keys(price) as Gem[]).every((g) => w[g] >= (price[g] ?? 0))
}

/** What is still missing, so the game can say "nog 2 🌸". */
export function missing(w: Wallet, price: Price): Price {
  const out: Price = {}
  for (const g of Object.keys(price) as Gem[]) {
    const short = (price[g] ?? 0) - w[g]
    if (short > 0) out[g] = short
  }
  return out
}

export function pay(w: Wallet, price: Price): boolean {
  if (!canAfford(w, price)) return false
  for (const g of Object.keys(price) as Gem[]) w[g] -= price[g] ?? 0
  return true
}
