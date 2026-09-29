import { describe, expect, test } from 'vitest'
import { toastScript, folderDialogScript, parsePick, showToast } from '../server/windows.ts'

describe('toastScript', () => {
  test('toast text cannot break out of the script', () => {
    const script = toastScript(`t'&<>"`, `b'&<>"`)
    // The raw title/body must never appear unescaped in the script.
    expect(script).not.toContain(`t'&<>"`)
    expect(script).not.toContain(`b'&<>"`)
    // XML-escaped, quote-doubled form must be present for both.
    const escapeAndDouble = (s: string): string =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        .replace(/'/g, "''")
    expect(script).toContain(escapeAndDouble(`t'&<>"`))
    expect(script).toContain(escapeAndDouble(`b'&<>"`))
  })

  test('toast uses the proven app id', () => {
    const script = toastScript('title', 'body')
    expect(script).toContain("'{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'")
  })
})

describe('folderDialogScript', () => {
  test('the dialog script reports cancel', () => {
    const script = folderDialogScript()
    expect(script).toContain('::cancelled::')
  })
})

describe('parsePick', () => {
  test('cancel is parsed', () => {
    expect(parsePick(0, '::cancelled::\r\n', '')).toEqual({ cancelled: true })
  })

  test('a chosen path is parsed', () => {
    expect(parsePick(0, 'C:\\work\\x\r\n', '')).toEqual({ path: 'C:\\work\\x' })
  })

  test('a failure carries stderr', () => {
    expect(parsePick(1, '', 'boom')).toEqual({ error: 'boom' })
  })

  test('empty output is an error', () => {
    const result = parsePick(0, '', '')
    expect('error' in result).toBe(true)
    expect((result as { error: string }).error.length).toBeGreaterThan(0)
  })
})

describe('showToast', () => {
  test('showToast never rejects', async () => {
    await expect(showToast('t', 'b', { exe: 'no-such-exe-agentics' })).resolves.toBeUndefined()
  })
})
