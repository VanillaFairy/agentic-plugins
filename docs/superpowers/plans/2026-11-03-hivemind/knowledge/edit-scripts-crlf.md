# Edit scripts in this environment
Heredocs in the Bash tool turn a backslash-n inside the script into a real newline, and the worktree files carry CRLF. Write edits as small `.cjs` files that read the file, replace `\r\n` with `\n`, use `String.fromCharCode(10)` for newlines in matched text, and use `Edit` for single-line changes.
