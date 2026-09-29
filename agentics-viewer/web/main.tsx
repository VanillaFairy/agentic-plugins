import { render } from 'preact'
import { App } from './App.tsx'
import { applyTheme, loadTheme } from './theme.ts'
import './styles.css'

// Applied before the first render, so there's no flash of the wrong theme.
applyTheme(loadTheme())

render(<App />, document.getElementById('app')!)
