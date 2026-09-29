# T01: Spike: toast and folder dialog from Node

rigor: verify
size: ~15 turns (2 edit sites, 2 files)

**Repository:** vanillafairy. **Runs inline in the main session**, never as a subagent: the user
has to see the toast and use the dialog.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | inherit | inherit | inline in the main session with the user |
| review | opus | medium | |
| fix | inherit | inherit | inline |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../knowledge/windows-powershell.md`
- Spec § 6.6 (toast), § 6.4 (Browse), § 10 step 1

## Dependencies
- Depends on: —
- Depended on by: T06

**Files:**
- Modify: `docs/superpowers/plans/2026-09-27-agentics-viewer/knowledge/windows-powershell.md`
- Create (scratchpad only, not committed): `spike.mjs`

**Scope / Negative Constraints:**
- No product code. The spike script lives in the session's scratchpad and is thrown away.
- If a script fails, try at most two variations: another AppUserModelID, or `-STA` placement.
  Then stop and ask the user whether to fall back (page-only alerts, a path field). Don't build a
  third workaround.

- [ ] **Step 1: Write the spike script in the scratchpad**

```js
// spike.mjs
import { spawn } from 'node:child_process'
const run = (script, sta) => new Promise((resolve) => {
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...(sta ? ['-STA'] : []), '-Command', '-']
  const p = spawn('powershell.exe', args, { windowsHide: true })
  let out = '', err = ''
  p.stdout.on('data', (d) => { out += d })
  p.stderr.on('data', (d) => { err += d })
  p.on('close', (code) => resolve({ code, out, err }))
  p.stdin.end(script)
})
const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const toast = (title, body) => `<the toast script from knowledge/windows-powershell.md with TITLE/BODY replaced by xml(title).replace(/'/g, "''") and xml(body).replace(/'/g, "''")>`
console.log(await run(toast("idle-rules is waiting on you", "Isn't it <idle> & 'quiet'?"), false))
console.log(await run(`<the folder dialog script>`, true))
```

Write the two scripts in full from `knowledge/windows-powershell.md`. The angle-bracket lines
above mark where they go.

- [ ] **Step 2: Run it with the user watching**

Run: `node spike.mjs`. Ask the user:
- did a toast appear, with the title and the body showing the quotes, `<idle>` and `&` literally?
- did the folder dialog appear, and did choosing a folder print its path? Also cancel it once.

- [ ] **Step 3: Record what worked**

Rewrite `knowledge/windows-powershell.md`:
- set its status to "proven on 2026-09-27" (or the day it runs);
- keep the exact working scripts and escaping;
- note anything that differed from the candidates: the AppUserModelID, flags, whether the dialog
  opened behind the app.
- If a script can't be made to work, record that and the user's chosen fallback. T06 and T09
  then implement the fallback instead.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-09-27-agentics-viewer/knowledge/windows-powershell.md
git commit -m "plan(agentics-viewer): toast and folder dialog proven on this machine"
```

## Acceptance
- [ ] The user saw a toast whose title and body showed `'`, `<`, `>` and `&` literally.
- [ ] The user saw the folder dialog. A chosen folder printed its path, and cancel printed
      `::cancelled::`.
- [ ] `knowledge/windows-powershell.md` holds the scripts exactly as they ran, marked proven, or
      the recorded fallback.
