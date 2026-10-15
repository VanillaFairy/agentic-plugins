import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.ts'
import type { SessionIndex } from '../server/sessions.ts'

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
    const app = createApp({ port: PORT, distDir: dir, index: {} as SessionIndex, staleMs: 0, now: Date.now })
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
