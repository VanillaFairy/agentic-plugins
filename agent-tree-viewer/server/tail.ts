// Reads a growing JSONL file a piece at a time: each read returns only the entries appended
// since the last one. A line still being written stays back until its newline arrives.

import { closeSync, openSync, readSync, statSync } from 'node:fs'

const NEWLINE = 0x0a

// Splits complete lines off `bytes`; what follows the last newline is the unfinished rest.
export function splitLines(bytes: Buffer): { lines: string[]; rest: Buffer } {
  const end = bytes.lastIndexOf(NEWLINE)
  if (end < 0) return { lines: [], rest: bytes }
  const lines = bytes.subarray(0, end).toString('utf8').split('\n').filter(line => line.trim() !== '')
  return { lines, rest: Buffer.from(bytes.subarray(end + 1)) }
}

export function parseLines(lines: readonly string[]): unknown[] {
  const out: unknown[] = []
  for (const line of lines) {
    try {
      out.push(JSON.parse(line))
    } catch {
      // A line Claude Code broke off mid-write; the next ones still count.
    }
  }
  return out
}

export class JsonlTail {
  private offset = 0
  private rest: Buffer = Buffer.alloc(0)
  mtime = 0

  readonly path: string

  constructor(path: string) {
    this.path = path
  }

  // `restarted` says the file shrank, so it was rewritten and everything read before is void.
  read(): { entries: unknown[]; restarted: boolean } {
    let size: number
    try {
      const stat = statSync(this.path)
      size = stat.size
      this.mtime = stat.mtimeMs
    } catch {
      return { entries: [], restarted: false }
    }
    const restarted = size < this.offset
    if (restarted) {
      this.offset = 0
      this.rest = Buffer.alloc(0)
    }
    if (size === this.offset) return { entries: [], restarted }

    const chunk = Buffer.alloc(size - this.offset)
    const fd = openSync(this.path, 'r')
    try {
      readSync(fd, chunk, 0, chunk.length, this.offset)
    } finally {
      closeSync(fd)
    }
    this.offset = size
    const { lines, rest } = splitLines(Buffer.concat([this.rest, chunk]))
    this.rest = rest
    return { entries: parseLines(lines), restarted }
  }
}
