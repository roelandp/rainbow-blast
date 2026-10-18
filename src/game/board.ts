import { Rng } from './rng'

export const SIZE = 8

/** Things Katrien collects from cleared blocks; they buy things for her island. */
export type Gem = 'bloem' | 'schelp' | 'ster' | 'diamant'
export const GEMS: Gem[] = ['bloem', 'schelp', 'ster', 'diamant']
export const GEM_EMOJI: Record<Gem, string> = { bloem: '🌸', schelp: '🐚', ster: '⭐', diamant: '💎' }

export interface Cell {
  color: number
  gem?: Gem
}

export type Grid = (Cell | null)[][]

export interface Piece {
  id: number
  /** Cells as [row, col] offsets, normalised so the minimum row and col are 0. */
  cells: [number, number][]
  color: number
  /** Index into cells of the block that carries a gem, if any. */
  gemAt?: number
  gem?: Gem
}

export const COLORS = 7

// Shapes written as little pictures; every rotation is listed where it differs.
const SHAPE_ART: { art: string[]; weight: number }[] = [
  { art: ['#'], weight: 3 },
  { art: ['##'], weight: 4 },
  { art: ['#', '#'], weight: 4 },
  { art: ['###'], weight: 4 },
  { art: ['#', '#', '#'], weight: 4 },
  { art: ['####'], weight: 3 },
  { art: ['#', '#', '#', '#'], weight: 3 },
  { art: ['#####'], weight: 1.5 },
  { art: ['#', '#', '#', '#', '#'], weight: 1.5 },
  { art: ['##', '##'], weight: 5 },
  { art: ['###', '###', '###'], weight: 1.5 },
  { art: ['###', '###'], weight: 2 },
  { art: ['##', '##', '##'], weight: 2 },
  // Small corners
  { art: ['##', '#.'], weight: 2.5 },
  { art: ['##', '.#'], weight: 2.5 },
  { art: ['#.', '##'], weight: 2.5 },
  { art: ['.#', '##'], weight: 2.5 },
  // L shapes
  { art: ['#.', '#.', '##'], weight: 1.5 },
  { art: ['.#', '.#', '##'], weight: 1.5 },
  { art: ['##', '#.', '#.'], weight: 1.5 },
  { art: ['##', '.#', '.#'], weight: 1.5 },
  { art: ['###', '#..'], weight: 1.5 },
  { art: ['###', '..#'], weight: 1.5 },
  { art: ['#..', '###'], weight: 1.5 },
  { art: ['..#', '###'], weight: 1.5 },
  // T shapes
  { art: ['###', '.#.'], weight: 1.5 },
  { art: ['.#.', '###'], weight: 1.5 },
  { art: ['#.', '##', '#.'], weight: 1.5 },
  { art: ['.#', '##', '.#'], weight: 1.5 },
  // S and Z
  { art: ['##.', '.##'], weight: 1.2 },
  { art: ['.##', '##.'], weight: 1.2 },
  { art: ['#.', '##', '.#'], weight: 1.2 },
  { art: ['.#', '##', '#.'], weight: 1.2 },
  // Big corners
  { art: ['###', '#..', '#..'], weight: 1 },
  { art: ['###', '..#', '..#'], weight: 1 },
  { art: ['#..', '#..', '###'], weight: 1 },
  { art: ['..#', '..#', '###'], weight: 1 },
]

export const SHAPES: { cells: [number, number][]; weight: number }[] = SHAPE_ART.map(({ art, weight }) => {
  const cells: [number, number][] = []
  art.forEach((row, r) => [...row].forEach((ch, c) => ch === '#' && cells.push([r, c])))
  return { cells, weight }
})

export function emptyGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array<Cell | null>(SIZE).fill(null))
}

export function cloneGrid(g: Grid): Grid {
  return g.map((row) => row.map((c) => (c ? { ...c } : null)))
}

export function pieceSize(p: { cells: [number, number][] }): { rows: number; cols: number } {
  let rows = 0
  let cols = 0
  for (const [r, c] of p.cells) {
    rows = Math.max(rows, r + 1)
    cols = Math.max(cols, c + 1)
  }
  return { rows, cols }
}

export function canPlace(g: Grid, p: { cells: [number, number][] }, row: number, col: number): boolean {
  for (const [r, c] of p.cells) {
    const rr = row + r
    const cc = col + c
    if (rr < 0 || cc < 0 || rr >= SIZE || cc >= SIZE) return false
    if (g[rr][cc]) return false
  }
  return true
}

export function fitsAnywhere(g: Grid, p: { cells: [number, number][] }): boolean {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (canPlace(g, p, r, c)) return true
  return false
}

export interface Lines {
  rows: number[]
  cols: number[]
}

/** Full rows and columns, as they would be with the given extra cells filled. */
export function fullLines(g: Grid, extra: [number, number][] = []): Lines {
  const filled = (r: number, c: number) => Boolean(g[r][c]) || extra.some(([er, ec]) => er === r && ec === c)
  const rows: number[] = []
  const cols: number[] = []
  for (let i = 0; i < SIZE; i++) {
    let row = true
    let col = true
    for (let j = 0; j < SIZE; j++) {
      if (!filled(i, j)) row = false
      if (!filled(j, i)) col = false
    }
    if (row) rows.push(i)
    if (col) cols.push(i)
  }
  return { rows, cols }
}

export interface ClearedCell {
  row: number
  col: number
  cell: Cell
}

export interface PlaceResult {
  lines: Lines
  cleared: ClearedCell[]
  gems: Gem[]
  /** Points for this move: one per block, plus the line bonus times the combo. */
  points: number
  linePoints: number
  combo: number
  boardEmpty: boolean
}

/** Points for clearing n lines at once, before the combo multiplier. */
export function linePoints(n: number): number {
  if (n <= 0) return 0
  // 1 line 10, 2 lines 30, 3 lines 60, 4 lines 100, ...
  return (10 * n * (n + 1)) / 2
}

export function clearLines(g: Grid, lines: Lines): ClearedCell[] {
  const out: ClearedCell[] = []
  const seen = new Set<number>()
  const take = (r: number, c: number) => {
    const key = r * SIZE + c
    const cell = g[r][c]
    if (seen.has(key) || !cell) return
    seen.add(key)
    out.push({ row: r, col: c, cell })
  }
  for (const r of lines.rows) for (let c = 0; c < SIZE; c++) take(r, c)
  for (const c of lines.cols) for (let r = 0; r < SIZE; r++) take(r, c)
  for (const { row, col } of out) g[row][col] = null
  return out
}

export function isEmpty(g: Grid): boolean {
  return g.every((row) => row.every((c) => !c))
}

export function countFilled(g: Grid): number {
  let n = 0
  for (const row of g) for (const c of row) if (c) n++
  return n
}

/** Picks a shape by weight. */
function pickShape(rng: Rng): [number, number][] {
  const total = SHAPES.reduce((s, x) => s + x.weight, 0)
  let t = rng.next() * total
  for (const s of SHAPES) {
    t -= s.weight
    if (t <= 0) return s.cells
  }
  return SHAPES[0].cells
}

let nextId = 1

export function makePiece(rng: Rng, cells: [number, number][]): Piece {
  const piece: Piece = { id: nextId++, cells: cells.map(([r, c]) => [r, c]), color: rng.int(COLORS) }
  // About one piece in three carries a little treasure.
  if (rng.next() < 0.36) {
    piece.gemAt = rng.int(piece.cells.length)
    const t = rng.next()
    piece.gem = t < 0.45 ? 'bloem' : t < 0.8 ? 'schelp' : t < 0.97 ? 'ster' : 'diamant'
  }
  return piece
}

/** Whether all pieces can go on the board in some order (clearing lines in between). */
export function allFit(g: Grid, pieces: Piece[], budget = { n: 20000 }): boolean {
  if (pieces.length === 0) return true
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]
    const rest = pieces.filter((_, j) => j !== i)
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (budget.n-- <= 0) return false
        if (!canPlace(g, p, r, c)) continue
        if (rest.length === 0) return true
        const next = cloneGrid(g)
        for (const [pr, pc] of p.cells) next[r + pr][c + pc] = { color: p.color }
        clearLines(next, fullLines(next))
        if (allFit(next, rest, budget)) return true
      }
    }
  }
  return false
}

/**
 * Three new pieces. For a young player the set is always solvable when that is
 * possible at all; on a crowded board we lean towards small pieces.
 */
export function dealPieces(g: Grid, rng: Rng): Piece[] {
  const filled = countFilled(g)
  for (let attempt = 0; attempt < 40; attempt++) {
    const set: Piece[] = []
    for (let i = 0; i < 3; i++) {
      let cells = pickShape(rng)
      // Crowded board: prefer pieces of 4 blocks or fewer.
      if (filled > 30 && cells.length > 4 && rng.next() < 0.6) cells = pickShape(rng)
      set.push(makePiece(rng, cells))
    }
    if (allFit(g, set)) return set
  }
  // Fallback: small pieces that fit somewhere, if any.
  const small = SHAPES.filter((s) => s.cells.length <= 3)
  const set: Piece[] = []
  for (let i = 0; i < 3; i++) {
    const options = small.filter((s) => fitsAnywhere(g, s))
    const pick = options.length ? options[rng.int(options.length)] : small[0]
    set.push(makePiece(rng, pick.cells))
  }
  return set
}

export interface GameState {
  grid: Grid
  tray: (Piece | null)[]
  score: number
  combo: number
  /** Moves since the last line clear; the combo ends after 3 moves without one. */
  dry: number
  rescues: number
  over: boolean
  gemsThisGame: Record<Gem, number>
}

export function newGame(rng: Rng): GameState {
  const grid = emptyGrid()
  return {
    grid,
    tray: dealPieces(grid, rng),
    score: 0,
    combo: 0,
    dry: 0,
    rescues: 0,
    over: false,
    gemsThisGame: { bloem: 0, schelp: 0, ster: 0, diamant: 0 },
  }
}

export function canMove(s: GameState): boolean {
  return s.tray.some((p) => p && fitsAnywhere(s.grid, p))
}

/** Puts a piece from the tray on the board. Returns null when it does not fit. */
export function place(s: GameState, trayIndex: number, row: number, col: number, rng: Rng): PlaceResult | null {
  const p = s.tray[trayIndex]
  if (!p || !canPlace(s.grid, p, row, col)) return null
  p.cells.forEach(([r, c], i) => {
    s.grid[row + r][col + c] = { color: p.color, gem: i === p.gemAt ? p.gem : undefined }
  })
  s.tray[trayIndex] = null

  const lines = fullLines(s.grid)
  const n = lines.rows.length + lines.cols.length
  const cleared = clearLines(s.grid, lines)
  const gems = cleared.flatMap((c) => (c.cell.gem ? [c.cell.gem] : []))

  if (n > 0) {
    s.combo += 1
    s.dry = 0
  } else {
    s.dry += 1
    if (s.dry >= 3) s.combo = 0
  }
  const lp = linePoints(n)
  const boardEmpty = n > 0 && isEmpty(s.grid)
  // A combo of 3 or more earns a diamond every third step; an empty board earns three.
  if (n > 0 && s.combo >= 3 && s.combo % 3 === 0) gems.push('diamant')
  if (boardEmpty) gems.push('diamant', 'diamant', 'diamant')
  for (const gem of gems) s.gemsThisGame[gem] += 1

  const points = p.cells.length + lp * Math.max(1, s.combo) + (boardEmpty ? 300 : 0)
  s.score += points

  if (s.tray.every((t) => !t)) s.tray = dealPieces(s.grid, rng)
  s.over = !canMove(s)
  return { lines, cleared, gems, points, linePoints: lp, combo: s.combo, boardEmpty }
}

/**
 * Katrien helps out after a solved sum: she sweeps away the fullest rows and
 * gives fresh pieces. Gems in the swept blocks are collected.
 */
export function rescue(s: GameState, rng: Rng): ClearedCell[] {
  const order = Array.from({ length: SIZE }, (_, r) => r).sort(
    (a, b) => s.grid[b].filter(Boolean).length - s.grid[a].filter(Boolean).length,
  )
  const cleared = clearLines(s.grid, { rows: order.slice(0, 3), cols: [] })
  for (const c of cleared) if (c.cell.gem) s.gemsThisGame[c.cell.gem] += 1
  s.tray = dealPieces(s.grid, rng)
  s.rescues += 1
  s.over = !canMove(s)
  return cleared
}
