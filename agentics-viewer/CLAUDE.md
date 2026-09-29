# CLAUDE.md — agentics-viewer

Conventions for changing the viewer.

## Versioning

`package.json`'s `version` follows [Semantic Versioning 2.0.0](https://semver.org/). Every change
that ships bumps it, in the same commit series as the change:

- MAJOR: anything a user or a script already relies on stops working: the state file's fields,
  the URL parameters, the launch commands, the default port, or the agentics versions supported.
- MINOR: a new feature that leaves all of that working.
- PATCH: a fix or a visual tweak that adds no feature.

The design spec is `docs/superpowers/specs/2026-09-27-agentics-viewer-design.md`; a
behaviour change updates it in the same commit series.
