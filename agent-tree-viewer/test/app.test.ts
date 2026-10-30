import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.ts'
import { Listing } from '../server/listing.ts'

const PORT = 51917

describe('the page', () => {
  let dir: string | undefined
  let close: (() => Promise<void>) | undefined
  afterEach(async () => {
    await close?.()
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  })

  it('stays the one built for this server when the files on disk are rebuilt', async () => {
    dir = mkdtempSync(join(tmpdir(), 'page-'))
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'index.html'), 'page one')
    writeFileSync(join(dir, 'assets', 'app.js'), 'code one')
    const app = createApp({ port: PORT, distDir: dir, listing: {} as Listing, staleMs: 0, now: Date.now })
    close = app.close
    await once(app.server, 'listening')

    writeFileSync(join(dir, 'index.html'), 'page two')
    writeFileSync(join(dir, 'assets', 'app.js'), 'code two')
    const get = (path: string) => fetch(`http://127.0.0.1:${PORT}${path}`).then(r => r.text())
    expect(await get('/')).toBe('page one')
    expect(await get('/assets/app.js')).toBe('code one')
    expect(await get('/some/route')).toBe('page one')
  })
})

describe('the listing thread', () => {
  it('hands the server what a session stream needs to open', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'listing-'))
    const id = '11111111-2222-3333-4444-555555555555'
    const project = join(dir, 'projects', 'repo')
    mkdirSync(project, { recursive: true })
    const entry = { type: 'user', cwd: join(dir, 'repo'), message: { content: 'say hello' } }
    writeFileSync(join(project, `${id}.jsonl`), `${JSON.stringify(entry)}\n`)
    const listing = new Listing({ projectsDir: join(dir, 'projects'), desktopDir: join(dir, 'none'), maxAgeMs: 3_600_000, pidDir: join(dir, 'none') })
    try {
      const groups = await listing.groups()
      expect(groups.flatMap(g => g.sessions).map(s => s.id)).toEqual([id])
      expect(listing.find(id)?.files.main).toBe(join(project, `${id}.jsonl`))
      expect(listing.groupOf(id)?.path).toBe(entry.cwd)
    } finally {
      await listing.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
