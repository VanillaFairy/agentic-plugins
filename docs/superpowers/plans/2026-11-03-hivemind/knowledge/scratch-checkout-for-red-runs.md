# Scratch checkout of the reviewed head for RED runs
```bash
H=/tmp/headcopy; mkdir -p "$H" && git archive a6ffa82 | tar -x -C "$H"
powershell -NoProfile -Command "New-Item -ItemType Junction -Path '$(cygpath -w $H)/node_modules' -Target '$(cygpath -w $PWD)/node_modules'"
cp test/*.mjs "$H/test/" && cd "$H" && node --test test/scheduler.test.mjs
```
The new tests run against the old source, so each failing test is its RED run. Remove the junction with `(Get-Item <path>).Delete()` in PowerShell before deleting the folder.
