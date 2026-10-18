import { describe, expect, it } from 'vitest'
import {
  SIZE, allFit, canMove, canPlace, emptyGrid, fullLines, linePoints, newGame, place, rescue, SHAPES, type GameState,
} from './board'
import { Rng } from './rng'
import { makeSum } from './sums'
import { boundsForStep, canAfford, canPlace as canBuild, itemInfo, missing, pay, place as build, sizeForStep } from './island'

function fillRow(s: GameState, r: number, except: number[] = []) {
  for (let c = 0; c < SIZE; c++) if (!except.includes(c)) s.grid[r][c] = { color: 0 }
}

describe('board', () => {
  it('has unique shapes', () => {
    const keys = SHAPES.map((s) => JSON.stringify(s.cells))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('places and refuses overlaps and edges', () => {
    const g = emptyGrid()
    const bar = { cells: [[0, 0], [0, 1], [0, 2]] as [number, number][] }
    expect(canPlace(g, bar, 0, 5)).toBe(true)
    expect(canPlace(g, bar, 0, 6)).toBe(false)
    g[0][6] = { color: 1 }
    expect(canPlace(g, bar, 0, 4)).toBe(false)
  })

  it('clears a row and a column at once, with combo points', () => {
    const rng = new Rng(1)
    const s = newGame(rng)
    fillRow(s, 7, [7])
    for (let r = 0; r < 7; r++) s.grid[r][7] = { color: 2, gem: r === 3 ? 'ster' : undefined }
    s.grid[7][7] = null
    s.tray[0] = { id: 1, cells: [[0, 0]], color: 3 }
    const res = place(s, 0, 7, 7, rng)!
    expect(res.lines.rows).toEqual([7])
    expect(res.lines.cols).toEqual([7])
    expect(res.cleared.length).toBe(15)
    expect(res.gems).toContain('ster')
    expect(res.points).toBe(1 + linePoints(2) + 300)
    expect(res.boardEmpty).toBe(true)
    expect(s.gemsThisGame.diamant).toBe(3)
  })

  it('keeps a combo for up to 2 dry moves', () => {
    const rng = new Rng(2)
    const s = newGame(rng)
    s.combo = 2
    for (let i = 0; i < 2; i++) {
      s.tray[0] = { id: 9, cells: [[0, 0]], color: 0 }
      place(s, 0, i, 0, rng)
      expect(s.combo).toBe(2)
    }
    s.tray[0] = { id: 9, cells: [[0, 0]], color: 0 }
    place(s, 0, 4, 4, rng)
    expect(s.combo).toBe(0)
  })

  it('full lines sees extra cells', () => {
    const s = newGame(new Rng(3))
    fillRow(s, 2, [4])
    expect(fullLines(s.grid).rows).toEqual([])
    expect(fullLines(s.grid, [[2, 4]]).rows).toEqual([2])
  })

  it('deals sets that fit, and a random game lasts and stays consistent', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = new Rng(seed)
      const s = newGame(rng)
      expect(allFit(s.grid, s.tray.filter(Boolean) as never)).toBe(true)
      let moves = 0
      while (!s.over && moves < 400) {
        const options: [number, number, number][] = []
        s.tray.forEach((p, i) => {
          if (!p) return
          for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (canPlace(s.grid, p, r, c)) options.push([i, r, c])
        })
        if (!options.length) break
        const [i, r, c] = rng.pick(options)
        expect(place(s, i, r, c, rng)).not.toBeNull()
        moves++
        if (s.over && s.rescues === 0) rescue(s, rng)
      }
      expect(moves).toBeGreaterThan(8)
      expect(s.over).toBe(!canMove(s))
    }
  })
})

describe('sums', () => {
  it('always has the answer once among four different choices', () => {
    const rng = new Rng(5)
    for (let i = 0; i < 500; i++) {
      const s = makeSum(rng)
      expect(s.choices.length).toBe(4)
      expect(new Set(s.choices).size).toBe(4)
      expect(s.choices.filter((c) => c === s.answer).length).toBe(1)
      expect(s.choices.every((c) => Number.isInteger(c) && c >= 0)).toBe(true)
    }
  })
})

describe('island shop', () => {
  it('pays and tells what is missing', () => {
    const w = { bloem: 3, schelp: 1, ster: 0, diamant: 0 }
    const bank = itemInfo('bankje')!
    expect(canAfford(w, bank.price)).toBe(false)
    expect(missing(w, bank.price)).toEqual({ schelp: 1 })
    w.schelp = 2
    expect(pay(w, bank.price)).toBe(true)
    expect(w).toEqual({ bloem: 0, schelp: 0, ster: 0, diamant: 0 })
  })

  it('grows from 4x4 to 12x12 without moving old tiles', () => {
    expect(sizeForStep(0)).toEqual({ w: 4, d: 4 })
    expect(sizeForStep(1)).toEqual({ w: 5, d: 4 })
    expect(sizeForStep(16)).toEqual({ w: 12, d: 12 })
    for (let s = 0; s < 16; s++) {
      const a = boundsForStep(s)
      const b = boundsForStep(s + 1)
      expect(b.minX).toBeLessThanOrEqual(a.minX)
      expect(b.minX + b.w).toBeGreaterThanOrEqual(a.minX + a.w)
    }
  })

  it('stacks blocks but nothing on furniture or water', () => {
    const bd = boundsForStep(0)
    let blocks = build([], bd, 0, 0, 'gras')!
    blocks = build(blocks, bd, 0, 0, 'zand')!
    expect(blocks.map((b) => b.y)).toEqual([0, 1])
    blocks = build(blocks, bd, 0, 0, 'mand')!
    expect(canBuild(blocks, bd, 0, 0, 'gras')).toBe('bovenop-meubel')
    blocks = build(blocks, bd, 1, 0, 'water')!
    expect(canBuild(blocks, bd, 1, 0, 'gras')).toBe('bovenop-water')
    expect(canBuild(blocks, bd, 9, 0, 'gras')).toBe('buiten')
  })
})
