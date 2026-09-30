// The entry point: runs serve.ts as a child and starts it again each time it exits to pick up
// a new version. Stays this small because its own code is never reloaded.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { RESTART_EXIT_CODE } from './start.ts'

const SERVE = fileURLToPath(new URL('./serve.ts', import.meta.url))

// Ctrl+C reaches the child too; it closes the server, and this process ends with it.
process.on('SIGINT', () => {})

function run(args: string[]): void {
  const child = spawn(process.execPath, [SERVE, ...args], { stdio: 'inherit' })
  child.on('exit', (code) => {
    if (code !== RESTART_EXIT_CODE) process.exit(code ?? 1)
    // The page is already open in the tabs that will reload.
    run(args.filter((a) => a !== '--open'))
  })
}

run(process.argv.slice(2))
