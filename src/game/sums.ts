import { Rng } from './rng'

export interface Sum {
  text: string
  answer: number
  choices: number[]
}

/**
 * A sum for an 8-year-old who is good with numbers: adding and taking away
 * up to 100, tables of 1 to 10, doubling and halving. Four choices, with
 * near misses as the other options (one off, ten off, a neighbouring table).
 */
export function makeSum(rng: Rng): Sum {
  const kind = rng.int(6)
  let text = ''
  let answer = 0
  const near: number[] = []
  switch (kind) {
    case 0: {
      const a = 12 + rng.int(60)
      const b = 3 + rng.int(9)
      text = `${a} + ${b}`
      answer = a + b
      near.push(answer + 1, answer - 1, answer + 10, answer - 10)
      break
    }
    case 1: {
      const a = 10 * (1 + rng.int(6)) + rng.int(10)
      const b = 10 * (1 + rng.int(3))
      text = `${a} + ${b}`
      answer = a + b
      near.push(answer + 10, answer - 10, answer + 1, a + b / 10)
      break
    }
    case 2: {
      const a = 25 + rng.int(70)
      const b = 3 + rng.int(9)
      text = `${a} − ${b}`
      answer = a - b
      near.push(answer + 1, answer - 1, answer + 10, answer - 10)
      break
    }
    case 3:
    case 4: {
      const a = 2 + rng.int(9)
      const b = 1 + rng.int(10)
      text = `${a} × ${b}`
      answer = a * b
      near.push(answer + a, answer - a, answer + b, answer - b, answer + 1)
      break
    }
    default: {
      if (rng.next() < 0.5) {
        const a = 6 + rng.int(45)
        text = `Het dubbele van ${a}`
        answer = 2 * a
        near.push(answer + 2, answer - 2, answer + 10, a + 2)
      } else {
        const a = 2 * (3 + rng.int(40))
        text = `De helft van ${a}`
        answer = a / 2
        near.push(answer + 1, answer - 1, answer + 5, answer + 10)
      }
    }
  }
  const options = rng.shuffle([...new Set(near)].filter((n) => n >= 0 && n !== answer))
  const choices = rng.shuffle([answer, ...options.slice(0, 3)])
  return { text, answer, choices }
}
