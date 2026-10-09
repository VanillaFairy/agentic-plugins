# agent-tree-viewer

A local web app that shows the subagents of any Claude Code session as a live tree. It does what the [agent-tree](https://github.com/VanillaFairy/agent-tree) plugin does in a side pane, but in a browser tab of its own: every session on this machine, a canvas you can drag and zoom, and a details pane with each agent's full command history.

It isn't a plugin and needs nothing installed in Claude Code. It reads the transcripts Claude Code already writes under `~/.claude/projects`, and the desktop app's session records for the names it shows.

## Running it

You'll need Node 26 or later.

On Windows, double-click `agent-tree-viewer.bat`. It installs the dependencies the first time, starts the server in a console window and opens the app in your browser. If the viewer is already running, it only opens the browser. Close the console or press Ctrl+C to stop it.

From a terminal:

```bash
npm install
npm run app
```

`npm start` runs the server without opening a browser. The page is built on start whenever its sources are newer than the last build.

## Using it

The left column lists your sessions from the last two weeks, grouped by project folder, with the titles the Claude app shows. A dot marks a session that wrote to its transcript in the last two minutes. Type in the filter box to narrow the list by project or session name.

The tree reads left to right: the session's own card first, the agents it spawned in the next column, their agents after that. The stripe on a card's left edge shows where the agent is at: amber while it runs, green when it's done, red if it failed, grey if it stopped or went quiet. A running agent's card shows the tool it's using right now, and a pulse runs along the line into it.

- Drag with the left button to pan. Scroll to zoom.
- Click the round mark where a card's lines leave to fold its agents away, and again to bring them back. Each session remembers its folds in this browser, across reloads and when you switch between sessions.
- Click a card to open its details on the right: what it was asked, its report, who spawned it, what it spawned, the models it used with their tokens and estimated cost, and every tool call it made, newest first. Click a call to see its full input and the start of its output. The session's own card also totals the whole session, every agent included.
- **Fit** shows the whole tree. **Follow** keeps the newest running agent in sight as the tree grows; panning or zooming by hand turns it off.
- **Hide done** leaves out finished agents, except ones with something still running under them.

Keys: `+` and `-` zoom, `F` fits, `L` follows, `H` hides done agents, `Esc` closes the details.

Costs are estimates at Anthropic's first-party API list prices, kept in `server/pricing.ts`. They're what the same tokens would cost on the API, not what a Claude subscription charges you.

Colours follow your system's light or dark setting.

## Settings

The port defaults to 5182. To change it, pass `--port`:

```bash
agent-tree-viewer.bat --port 5190
```

or put it in `~/.agent-tree-viewer/config.json`, along with the other settings:

```json
{
  "port": 5190,
  "maxAgeDays": 14,
  "staleMinutes": 15
}
```

- `maxAgeDays`: sessions untouched for longer are left out of the list.
- `staleMinutes`: an agent whose transcript stays silent this long, with nothing saying it ended, is shown as stopped. Claude Code writes nothing when a session is closed mid-run, so this is the only way to tell.

## Developing

```bash
npm test
```

runs the typecheck and the tests. `npx vite` serves the page with hot reload on port 5174 and forwards the API to a server started with `npm start`.
