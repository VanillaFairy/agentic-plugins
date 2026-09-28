---
roles: implementer, test-author, auditor, reviewer
---
# `agentics-viewer/node_modules` after T03 merges

T03's `npm install` populates `node_modules` only inside T03's own worktree checkout, not the
integration branch's `agentics-viewer/` (a merge never carries `node_modules`, since `.gitignore`
excludes it). After T03 merges, run `npm install` once at the integration checkout's
`agentics-viewer/` before junctioning any later worktree to it, per `run-checks-viewer.md`.
