// Light/dark theme, forced independent of the OS setting. `null` means "follow the OS", the
// default until the viewer picks one explicitly. Wrapped in try/catch: a private window, or
// storage the browser has blocked, must never break the page — it just forgets the choice.

export type Theme = 'light' | 'dark'

const KEY = 'agentics-viewer:theme'

export function loadTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

export function saveTheme(theme: Theme | null): void {
  try {
    if (theme === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // no storage — the choice just doesn't survive a reload
  }
}

export function systemTheme(): Theme {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Sets or clears the `data-theme` attribute the page's CSS keys its forced palette on. */
export function applyTheme(theme: Theme | null): void {
  const root = document.documentElement
  if (theme === null) root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}
