import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { JsonlTail, splitLines } from '../server/tail.ts'

describe('splitLines', () => {
  it('holds back an unfinished line, even one cut inside a multi-byte character', () => {
    const whole = Buffer.from('{"a":1}\n{"b":"ж')
    const cut = whole.subarray(0, whole.length - 1)
    const first = splitLines(cut)
    expect(first.lines).toEqual(['{"a":1}'])
    const second = splitLines(Buffer.concat([first.rest, whole.subarray(whole.length - 1), Buffer.from('"}\n')]))
    expect(second.lines).toEqual(['{"b":"ж"}'])
    expect(second.rest.length).toBe(0)
  })
})

describe('JsonlTail', () => {
  let dir: string | undefined
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('returns only what was appended since the last read, and starts over when the file shrinks', () => {
    dir = mkdtempSync(join(tmpdir(), 'tail-'))
    const file = join(dir, 's.jsonl')
    writeFileSync(file, '{"n":1}\n{"n":')
    const tail = new JsonlTail(file)
    expect(tail.read()).toEqual({ entries: [{ n: 1 }], restarted: false })
    appendFileSync(file, '2}\nnot json\n{"n":3}\n')
    expect(tail.read()).toEqual({ entries: [{ n: 2 }, { n: 3 }], restarted: false })
    expect(tail.read().entries).toEqual([])
    writeFileSync(file, '{"n":9}\n')
    expect(tail.read()).toEqual({ entries: [{ n: 9 }], restarted: true })
  })

  it('reads nothing from a file that does not exist yet', () => {
    expect(new JsonlTail(join(tmpdir(), 'no-such-dir-xyz', 'a.jsonl')).read()).toEqual({ entries: [], restarted: false })
  })
})
