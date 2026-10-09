import { render } from 'preact'
import '@fontsource/sofia-sans/800.css'
import '@fontsource/sofia-sans-semi-condensed/400.css'
import '@fontsource/sofia-sans-semi-condensed/500.css'
import '@fontsource/sofia-sans-semi-condensed/600.css'
import '@fontsource/sofia-sans-semi-condensed/700.css'
import '@fontsource/jetbrains-mono/400.css'
import { App } from './App.tsx'
import './styles.css'

render(<App />, document.getElementById('app')!)
