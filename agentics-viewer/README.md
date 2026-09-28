# agentics-viewer

A local web app that shows an agentics effort's tree live, updating as the effort's files
change on disk.

## Running it

```
npm install
npm start
```

Then open `http://127.0.0.1:4747`, either in the Claude desktop app's Browser pane or in any
browser.

## Settings

Settings are read once at start from the state file `~/.agentics-viewer/state.json`, which holds:

- `port`: the port the server listens on.
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
