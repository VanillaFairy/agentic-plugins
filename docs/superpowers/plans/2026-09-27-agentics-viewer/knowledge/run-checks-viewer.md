---
roles: implementer, test-author, auditor, reviewer
---
# Run the viewer's checks

From `agentics-viewer/` in the vanillafairy repository:

```bash
npm test
```

`npm test` is `tsc --noEmit && vitest run --passWithNoTests`, so the typecheck gates every run.
For one file: `npx vitest run test/<name>.test.ts`. Build the page with `npx vite build`, which
writes `dist/`.

A fresh worktree has no `node_modules`. Junction it to the main checkout's copy instead of
installing:

```powershell
New-Item -ItemType Junction -Path "<worktree>\agentics-viewer\node_modules" -Target "C:\work\claude\vanillafairy\.claude\worktrees\agentics-tasks-observability-f37843\agentics-viewer\node_modules"
```

Only T03 runs `npm install`. Before deleting a worktree, unlink the junction (`(Get-Item <path>).Delete()`)
so the recursive delete doesn't follow it.

Every commit keeps `npm test` green, except a red task's commit, which fails only on the tests it
adds.
