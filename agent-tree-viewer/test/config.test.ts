import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, resolveConfig } from '../server/config.ts'

describe('resolveConfig', () => {
  it('takes the port from --port over the config file, and the file over the default', () => {
    expect(resolveConfig(undefined, []).config.port).toBe(DEFAULT_CONFIG.port)
    expect(resolveConfig('{"port": 6000}', []).config.port).toBe(6000)
    expect(resolveConfig('{"port": 6000}', ['--port', '6001']).config.port).toBe(6001)
  })

  it('keeps the port it had and says why when a port is not a port', () => {
    const fromArg = resolveConfig('{"port": 6000}', ['--port', 'abc'])
    expect(fromArg.config.port).toBe(6000)
    expect(fromArg.problem).toContain('--port')
    const fromFile = resolveConfig('{"port": 70000}', [])
    expect(fromFile.config.port).toBe(DEFAULT_CONFIG.port)
    expect(fromFile.problem).toContain('port')
  })

  it('falls back to the defaults when the file is not JSON', () => {
    const r = resolveConfig('{port:', [])
    expect(r.config).toEqual(DEFAULT_CONFIG)
    expect(r.problem).toBeDefined()
  })
})
