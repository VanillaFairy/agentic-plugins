---
roles: implementer, test-author
---
# Line endings on this machine

Git's system config sets `core.autocrlf=true`, so every working tree here is CRLF, whatever the
repository stores.

- Edit files with the Edit tool, which keeps the file's endings.
- A script that edits or matches text reads the file's endings first (`s.includes('\r\n')`) and
  writes the same ones. A pattern written with `\n` silently misses a CRLF file and exits 0.
- After any scripted edit, confirm it landed (`git diff <file>`).
- Tests that write fixture files write `\n`. Tests that read repository files split on `/\r?\n/`.
