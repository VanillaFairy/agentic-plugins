# T14: Detail panel

rigor: verify
size: ~18 turns (4 edit sites, 6 files)

**Repository:** vanillafairy.

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | scoped to the findings list |

## References
- Read: `../shared/interfaces.md` § Page components and § View model (page)
- Spec § 7.2 (Type), § 7.5 (Detail panel), § 7.6
- Mockup: `docs/superpowers/specs/2026-09-27-agentics-viewer-mockup.html` (`.detail`, `.state`, `.crit`, `.links`, `.meta`)

## Dependencies
- Depends on: T11
- Depended on by: T15b

**Files:**
- Create: `agentics-viewer/web/markdown.ts`
- Modify: `agentics-viewer/web/Detail.tsx`
- Create: `agentics-viewer/web/detail.css`: the detail rules, imported by `Detail.tsx`. Tokens come
  from `styles.css` (T11), which this task does not modify

**Scope / Negative Constraints:**
- Only `markdown.ts` imports `marked` and `dompurify`. It exports
  `inlineMarkdown(text: string): string`: `marked.parseInline`, then `DOMPurify.sanitize` with
  `ALLOWED_TAGS: ['em','strong','code','a','br']` and `ALLOWED_ATTR: ['href']`. That HTML is the
  only thing set with `dangerouslySetInnerHTML`.
- Wording comes from the model (`kindWord`, `fileLabel`, `returnInWords`, `ago`, `spendText`,
  `vscodeLink`).
- Don't touch `App.tsx` or the other components.

## Behaviour
- **First line** (12.5 px, `--ink-2`): `<id>, <kindWord(kind)>, <rigor>, <raw status>`. Empty
  parts are skipped.
- **Name:** 20 px, semi-condensed, weight 600. **Title:** Sitka Text, 15 px.
- **State block** for `parked`: heading "Waiting on you: `<returnInWords(return)>`", then the
  question in full. For `escalated`: heading "Escalated", then the reason, then the detail.
- **Active tasks with commits:** "`<stage>`, `<n>` commit(s), last `<ago(last_at, now)>`:
  `<last_subject>`". App passes `now`, refreshed every 30 s.
- **Folder nodes** also show approval in words ("approved", "prepared", "not approved", "edited
  since approval") and "`<n>` blocking questions" when above 0.
- **Sections,** each only when non-empty:
  - Context: intent, then context, through `inlineMarkdown`, in Sitka Text.
  - Criteria: a checklist. Each `check` is shown beneath its item in Cascadia Mono. `HUMAN:` items
    drop the prefix and get a "You decide" tag.
  - Files: "Spec in `<relative folder>/DESIGN.md`" with its line, each brief and report labelled
    by `fileLabel(path, 'brief' | 'report')`, and "Worktree". Each is a `vscodeLink` anchor, with a copy-path button (`aria-label` "Copy
    path") that uses `navigator.clipboard.writeText` and falls back to selecting a hidden input.
  - Writes: the locus paths.
  - Spend: `spendText`.

- [ ] **Step 1: Implement** `markdown.ts`, `Detail.tsx` and the detail styles.
- [ ] **Step 2: Verify**: `npm test` and `npx vite build` pass.
- [ ] **Step 3: Commit**

```bash
git add agentics-viewer/web/markdown.ts agentics-viewer/web/Detail.tsx agentics-viewer/web/detail.css
git commit -m "feat(agentics-viewer): the detail panel"
```

## Acceptance
- [ ] `npm test` and `npx vite build` pass.
- [ ] Only `markdown.ts` imports `marked` or `dompurify`. `dangerouslySetInnerHTML` appears only
      with `inlineMarkdown`'s output.
- [ ] The sections, links and copy buttons follow the Behaviour list. They're checked in T15b.
