import { describe, expect, it } from 'vitest'
import { markdownHtml } from '../web/markdown.ts'

describe('markdown from a transcript', () => {
  it('shows raw HTML as text', () => {
    const html = markdownHtml('Before <img src=x onerror="alert(1)"> after\n\n<script>alert(2)</script>')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
  })

  it('keeps web links and drops script ones to their text', () => {
    expect(markdownHtml('[site](https://example.com)')).toContain('href="https://example.com"')
    const html = markdownHtml('[click](javascript:alert(1))')
    expect(html).not.toContain('href')
    expect(html).toContain('click')
  })
})
