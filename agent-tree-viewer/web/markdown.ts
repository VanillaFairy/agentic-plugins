// Markdown to HTML for the page. The text comes from transcripts, so raw HTML in it shows as text
// and only links that cannot run script are made.

import { Marked } from 'marked'

const SAFE_HREF = /^(https?:|mailto:|#)/i

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const marked = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }) => escape(text),
    link(token) {
      return SAFE_HREF.test(token.href) ? false : this.parser.parseInline(token.tokens)
    },
  },
})

export const markdownHtml = (text: string): string => marked.parse(text, { async: false })
