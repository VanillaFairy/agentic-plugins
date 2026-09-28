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
- `roots`: the project directories whose efforts the viewer watches.
- `depth`: how many levels of the effort tree to expand by default.
- `agentics_path`: the path to an agentics dev checkout, when running against one instead of the
  installed plugin.
- `recent`: the roots opened most recently.
- `last`: the root and effort open when the viewer last closed.
- `alerted`: the alerts already shown, so they don't repeat.

## Requirements

agentics-viewer needs agentics 4.0.0 or later, and runs on Windows only. It never writes under a
project's `.agentics/`.
