import { marked } from 'marked'
import DOMPurify from 'dompurify'

const ALLOWED_TAGS = ['em', 'strong', 'code', 'a', 'br']
const ALLOWED_ATTR = ['href']

export function inlineMarkdown(text: string): string {
  const html = marked.parseInline(text, { async: false }) as string
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
}
