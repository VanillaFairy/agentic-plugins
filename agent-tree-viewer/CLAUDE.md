# CLAUDE.md — agent-tree-viewer

Conventions for changing the viewer.

## Versioning

`package.json`'s `version` follows [Semantic Versioning 2.0.0](https://semver.org/). Every change
that ships bumps it, in the same commit series as the change:

- MAJOR: anything a user or a script already relies on stops working: the config file's fields,
  the URL parameters, the launch commands or the default port.
- MINOR: a new feature that leaves all of that working.
- PATCH: a fix or a visual tweak that adds no feature.

## Where things come from

- `server/transcript.ts` turns transcript entries into the tree. A subagent's parent is whoever
  made the tool call its `agent-<id>.meta.json` names (`toolUseId`), or for a Workflow agent the
  call whose result names its run folder.
- `server/sessions.ts` names sessions: the desktop app's records under
  `%APPDATA%\Claude\claude-code-sessions` first, then the transcript's own title entries.
- Claude Code's transcript format is undocumented. When a status or a name comes out wrong,
  look at the real files under `~/.claude/projects` before changing the rules.
