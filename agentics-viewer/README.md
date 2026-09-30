# agentics-viewer

A local web app that shows an agentics effort's tree live, updating as the effort's files
change on disk. [CLAUDE.md](CLAUDE.md) says how its version moves.

## Running it

Double-click `agentics-viewer.cmd`, or open it from a file manager. It opens a console of its own
that stays open, installs dependencies on first run, starts the viewer there and opens
`http://127.0.0.1:5181` in your default browser. Run from a console you already have, it uses that
one and keeps it until the viewer stops. If the viewer is already running, it only opens the page.
Close the console or press Ctrl+C to stop the viewer.

A running viewer updates itself. When `package.json`'s version changes on disk, after a
`git pull` or a local bump, the server restarts, rebuilds the page and the open tabs reload. If
the update changed the dependencies, stop it and run `npm install` first.

From a terminal, the same thing is:

```
npm install
npm run app
```

`npm start` starts the viewer without opening a browser.

## Changing the page

`npx vite` serves `web/` at `http://localhost:5173` with hot reload and forwards `/api` to the
viewer on port 5181, which must be running. A saved change to a file in `web/` shows at once.
The viewer itself serves the built `dist/`, rebuilt at start when `web/` is newer, or with
`npm run build`.

## Settings

Settings are read once at start from the state file `~/.agentics-viewer/state.json`, which holds:

- `port`: the port the server listens on, 5181 by default.
- `roots`: the folders scanned for projects, which are subfolders containing a `.agentics/`
  directory.
- `depth`: how many levels deep under `roots` that scan goes.
- `agentics_path`: the path to an agentics dev checkout, when running against one instead of the
  installed plugin.
- `recent`: the last eight projects opened, newest first.
- `last`: the project and effort open when the viewer last closed.
- `alerted`: the highest park or escalation event `seq` already alerted, per project and effort.

## Requirements

agentics-viewer needs agentics 4.0.0 or later, and runs on Windows only. It never writes under a
project's `.agentics/`.
