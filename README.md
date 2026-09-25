# vanillafairy

VanillaFairy's Claude Code plugins, in one marketplace. Each plugin lives in its own repository,
held here as a git submodule.

| Plugin | What it does |
|---|---|
| [agentics](https://github.com/VanillaFairy/agentics) | Workflow-orchestrated design, investigation and development over a codebase |
| [improve-clauding](https://github.com/VanillaFairy/improve-clauding) | Retrospective over your recent Claude Code and Cursor sessions |
| [socratic](https://github.com/VanillaFairy/socratic) | Adversarial multi-agent debate as a decision aid |
## Install

```
/plugin marketplace add VanillaFairy/agentic-plugins
/plugin install <plugin>@vanillafairy
```

To update later, run `/plugin marketplace update vanillafairy`.

## Maintaining

Clone with `git clone --recurse-submodules`. To ship a plugin change, push it in the plugin's own
repository, then move the submodule pointer here and push:

```
git submodule update --remote <plugin>
git commit -am "Bump <plugin>"
```
