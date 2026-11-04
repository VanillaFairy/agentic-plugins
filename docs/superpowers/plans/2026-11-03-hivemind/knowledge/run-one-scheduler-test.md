# Run one scheduler test by name

```bash
node --test --test-name-pattern="<part of the test name>" test/scheduler.test.mjs
```

The flag may be repeated to run several; the pattern is a regex, so keep apostrophes out of it when it sits inside bash double quotes. A single test takes about 0.5 s, against about 30 s for the file.
