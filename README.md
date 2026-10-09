# vanillafairy

VanillaFairy's Claude Code plugins, in one marketplace.

| Plugin | What it does |
|---|---|
| [agentics](https://github.com/VanillaFairy/agentics) | Code-orchestrated design, investigation and development over a codebase |
| [improve-clauding](https://github.com/VanillaFairy/improve-clauding) | Retrospective over your recent Claude Code and Cursor sessions |
| [socratic](https://github.com/VanillaFairy/socratic) | Adversarial multi-agent debate as a decision aid |
| [agent-tree](https://github.com/VanillaFairy/agent-tree) | Live, zoomable graph of your session's subagents in a side pane |

## Plugin repositories

Each plugin lives in its own git repository. This repository holds only the marketplace
metadata in `.claude-plugin/marketplace.json`, which points every plugin at its GitHub
repository.

Not every plugin repository is public. Adding the marketplace always works, because Claude Code
fetches a plugin only when you install it. To install a private plugin, you need read access to
its repository and git credentials that Claude Code can use without a prompt, for example from
`gh auth setup-git`. Without access, the install of that plugin fails and the other plugins are
not affected.

## Tools

`agentics-viewer/` is a local web app that shows an agentics effort's tree live. It is not a
plugin and isn't listed in the marketplace. See its README.

`agent-tree-viewer/` is a local web app that shows the live subagent tree of any Claude Code
session on this machine, the agent-tree plugin's view in a browser tab. It isn't a plugin
either. See its README.

## Install

```
/plugin marketplace add VanillaFairy/agentic-plugins
/plugin install <plugin>@vanillafairy
```

To update later, run `/plugin marketplace update vanillafairy`.

## Maintaining

To ship a plugin change, bump the version in the plugin's `.claude-plugin/plugin.json` and push
the plugin's own repository. Installs pick up the new version from its default branch. This
repository changes only when you add a plugin or edit a marketplace entry.

For local work, clone a plugin repository into a folder of the same name at the root of this
repository. `.gitignore` excludes those folders.
