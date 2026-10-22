# agent-tree-viewer

A local web app that shows the subagents of any Claude Code session as a live tree. It does what the [agent-tree](https://github.com/VanillaFairy/agent-tree) plugin does in a side pane, but in a browser tab of its own: every session on this machine, a canvas you can drag and zoom, and a details pane that tells each agent's work step by step.

It isn't a plugin and needs nothing installed in Claude Code. It reads the transcripts Claude Code already writes under `~/.claude/projects`, the desktop app's session records for the names it shows, and the status file each running Claude Code process keeps under `~/.claude/sessions`.

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

The left column lists your sessions from the last two weeks, grouped by project folder, with the titles the Claude app shows. A dot marks a session that's working right now: thinking, running a tool, or waiting on a background agent or shell. A ring marks one that's waiting on you, for a permission prompt or a question; hover it to see which. Type in the filter box to narrow the list by project or session name, and tick **Hide inactive sessions** to list only the working and waiting ones.

The tree reads left to right: the session's own card first, the agents it spawned in the next column, their agents after that. The stripe on a card's left edge shows where the agent is at: amber while it runs, green when it's done, red if it failed, grey if it stopped or went quiet. A running agent's card shows the tool it's using right now, and a pulse runs along the line into it.

- Drag with the left button to pan. Scroll to zoom.
- Click the round mark where a card's lines leave to fold its agents away, and again to bring them back. Each session remembers its folds in this browser, across reloads and when you switch between sessions.
- Click a card to open its details on the right. Pinned at the top: when it started and ended, who spawned it, its tool calls, how many agents it spawned and what it cost; open the breakdown for tokens per model and the list of spawned agents. The session's own card also totals the whole session, every agent included. Below, the agent's work as one timeline, oldest at the top: what it was asked, what it wrote, its thinking where the transcript keeps it, and its tool calls in runs, down to what it does right now or how it ended. Click a call to see all of it: the command or each field it was given, and everything it returned. A call that spawned an agent links to that agent.
- **Fit** shows the whole tree. **Follow** keeps the newest running agent in sight as the tree grows; panning or zooming by hand turns it off.
- An [agentics](https://github.com/VanillaFairy/agentics) run the session started shows as a card of its own under the session's card, with each agent the run dispatched under it, named by the work it does (its node or thread), its role and its model. The run is a program, not a model, so its card looks like one: a squarer plate in the run's indigo, with the program's pid and a heartbeat trace that beats while the run is alive and lies flat once it stops. The sessions it dispatched hang off it on dashed indigo wires, with dashed edges and their role in indigo, so they read apart from the subagents a session spawns inside its own process; selecting the run lists them with their role, model and status. agentics runs every agent as a separate headless session; the viewer finds the runs a session started in the `.agentics` folder of the repository it runs in, and the run's card stays running while the run's heartbeat is fresh. Those headless sessions aren't listed on the left on their own: the session that started the run gets one line per run under it (`survey · 100 agents`), which opens the session with the run's card selected, and a link to one of them (`?session=<its id>`) opens the session that started its run with its card selected. Runs from agentics versions that didn't record the starting session leave their sessions listed as usual.
- **Hide done** leaves out finished agents, except ones with something still running under them.
- **Autocompact done**, there while done agents show, folds every card whose agents are all finished. The card itself stays; click its fold mark to open it again.

Keys: `+` and `-` zoom, `F` fits, `L` follows, `H` hides done agents, `Esc` closes the details.

Costs are estimates at Anthropic's first-party API list prices, kept in `server/pricing.ts`. They're what the same tokens would cost on the API, not what a Claude subscription charges you.

Colours follow your system's light or dark setting.

## Settings

The port defaults to 5183. To change it, pass `--port`:

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
