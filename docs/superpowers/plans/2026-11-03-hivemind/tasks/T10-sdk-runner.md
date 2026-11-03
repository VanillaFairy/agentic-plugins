# Task T10: The SDK runner

rigor: tdd
size: ~28 turns (5 edit sites, 10 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | high | isolation and billing settings must be exact; a miss costs the user's plan |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Runner and scheduler and § Tools and the Hive
- Read: `../shared/architecture.md` § Design decisions
- Read: `../knowledge/sdk-usage.md`

## Dependencies
- Depends on: T06, T08b
- Depended on by: T12

## Scope
**Files:**
- Create: `src/runner-sdk.mjs`, `test/runner-sdk.test.mjs`
- Create: `prompts/ground-rules.md`: the twelve ground rules of the spec's §10, word for word
  (`C:\work\claude\vanillafairy\docs\superpowers\specs\2026-11-03-hivemind-design.md`)
- Create: `prompts/reporter.md`: write the report from the skeleton given, in plain language, by
  question; never add, drop or reorder a worldview, crux or answer; say "undecided" for a crux with
  no `decides` claim

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- `createSdkRunner({ dir, physics, sdk })` returns a Runner. `sdk` defaults to the real module
  (`await import('@anthropic-ai/claude-agent-sdk')`); tests pass a fake with `query`, `tool`,
  `createSdkMcpServer` that records options and yields scripted messages.
- Options for every agent call: exactly the isolation block of `knowledge/sdk-usage.md`, with
  `systemPrompt` = `prompts/ground-rules.md`, `model` and `effort` from `physics.run`,
  `maxTurns` = `physics.run.burst + 2`, `cwd` = `dir`, `env` = `cleanEnv(process.env)`.
- The physics tools as one `createSdkMcpServer({ name: 'hive', ... , alwaysLoad: true })`, one
  `tool()` per name in `TOOL_NAMES` with a zod schema mirroring the input table; each handler
  calls `tools.call(name, input)` and returns its JSON as text; when the call resolves `done`, the
  runner calls `q.interrupt()` after the handler returns.
- `mutate` and `report` use the same isolation with no `mcpServers` and `allowedTools: []`, and
  `persistSession: false`; `report`'s system prompt is `prompts/reporter.md`.
- Limit: an error or error result whose text matches `/usage limit|rate limit|429/i` → `limit: true`.

## Implementation Steps

### Step 1: Write the failing tests

```js
// test/runner-sdk.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSdkRunner, cleanEnv } from '../src/runner-sdk.mjs';

const P = { run: { model: 'opus', effort: 'high', burst: 4 } };
function fakeSdk(script) {
  const calls = [];
  return { calls,
    tool: (name, desc, shape, handler) => ({ name, shape, handler }),
    createSdkMcpServer: (cfg) => ({ cfg }),
    query: ({ prompt, options }) => {
      calls.push({ prompt, options });
      const msgs = script.shift() ?? [];
      const it = (async function* () {
        for (const m of msgs) {
          if (m instanceof Error) throw m;
          if (m.callTool) { await options.mcpServers.hive.cfg.tools.find((t) => t.name === m.callTool).handler({}); continue; }
          yield m;
        }
      })();
      it.interrupt = async () => { calls.push({ interrupt: true }); return {}; };
      return it;
    } };
}
const ok = (session, usage = { input_tokens: 2, cache_read_input_tokens: 800, cache_creation_input_tokens: 60, output_tokens: 40 }) =>
  [{ type: 'system', subtype: 'init', session_id: session }, { type: 'result', subtype: 'success', session_id: session, usage }];
const agent = { id: 'a-5', session: 's-parent' };
const tools = { call: async () => ({ ok: true, result: {}, done: false }) };

test('every agent runs isolated, on the run model, with only the hive tools', async () => {
  const sdk = fakeSdk([ok('s-1')]);
  await createSdkRunner({ dir: '/run', physics: P, sdk }).start(agent, 'genome', tools);
  const o = sdk.calls[0].options;
  assert.deepEqual([o.settingSources, o.strictMcpConfig, o.settings.autoMemoryEnabled, o.model], [[], true, false, 'opus']);
  assert.ok(o.allowedTools.every((t) => t.startsWith('mcp__hive__')));
  assert.ok(o.mcpServers.hive);
  assert.match(o.systemPrompt, /balance is your life/);
});

test('the environment keeps no API key or Claude variables except the config dir', () => {
  const env = cleanEnv({ PATH: 'p', ANTHROPIC_API_KEY: 'k', CLAUDE_CODE_OAUTH_TOKEN: 't', CLAUDE_CONFIG_DIR: 'c' });
  assert.deepEqual(env, { PATH: 'p', CLAUDE_CONFIG_DIR: 'c' });
});

test('start sends the genome turn, wake resumes, fork resumes as a fork', async () => {
  const sdk = fakeSdk([ok('s-1'), ok('s-1'), ok('s-2')]);
  const r = createSdkRunner({ dir: '/run', physics: P, sdk });
  const a = await r.start(agent, 'GENOME', tools);
  await r.wake({ ...agent, session: 's-1' }, 'Your turn.', tools);
  const f = await r.fork({ id: 'a-6' }, 's-1', 'CHILD', tools);
  assert.equal(sdk.calls[0].prompt, 'GENOME');
  assert.equal(sdk.calls[1].options.resume, 's-1');
  assert.deepEqual([sdk.calls[2].options.resume, sdk.calls[2].options.forkSession, sdk.calls[2].prompt], ['s-1', true, 'CHILD']);
  assert.deepEqual([a.session, f.session], ['s-1', 's-2']);
});

test('usage comes from the result message in the four fields', async () => {
  const sdk = fakeSdk([ok('s-1')]);
  const w = await createSdkRunner({ dir: '/run', physics: P, sdk }).start(agent, 'g', tools);
  assert.deepEqual(w.usage, { input: 2, cache_read: 800, cache_write: 60, output: 40 });
});

test('a usage-limit error is reported as limit, not thrown', async () => {
  const sdk = fakeSdk([[{ type: 'system', subtype: 'init', session_id: 's-1' }, new Error('Claude AI usage limit reached')]]);
  const w = await createSdkRunner({ dir: '/run', physics: P, sdk }).wake({ ...agent, session: 's-1' }, 'go', tools);
  assert.equal(w.limit, true);
});

test('a tool call that ends the wake interrupts the query', async () => {
  const [init, result] = ok('s-1');
  const sdk = fakeSdk([[init, { callTool: 'rest' }, result]]);
  const done = { call: async () => ({ ok: true, result: {}, done: true }) };
  await createSdkRunner({ dir: '/run', physics: P, sdk }).start(agent, 'g', done);
  assert.ok(sdk.calls.some((c) => c.interrupt));
});

test('mutate and report run with no tools', async () => {
  const sdk = fakeSdk([[{ type: 'result', subtype: 'success', result: '{"lens":"x"}', usage: {} }], [{ type: 'result', subtype: 'success', result: 'REPORT', usage: {} }]]);
  const r = createSdkRunner({ dir: '/run', physics: P, sdk });
  assert.equal(await r.mutate('m'), '{"lens":"x"}');
  assert.equal(await r.report('skeleton'), 'REPORT');
  for (const c of sdk.calls) assert.deepEqual(c.options.allowedTools, []);
});
```

### Step 2: Run `node --test test/runner-sdk.test.mjs` — Expected: FAIL, module not found
### Step 3: Implement `src/runner-sdk.mjs` and write the two prompts
### Step 4: Run `node --test test/` — Expected: PASS
### Step 5: Commit
```bash
git add src/runner-sdk.mjs test/runner-sdk.test.mjs prompts/ground-rules.md prompts/reporter.md
git commit -m "Run agents as isolated Agent SDK sessions on the subscription"
```

## Acceptance Criteria
- [ ] Every agent call carries `settingSources: []`, `strictMcpConfig: true`, `autoMemoryEnabled: false`, the run model and the ground rules as system prompt → test 'every agent runs isolated, on the run model, with only the hive tools'
- [ ] `allowedTools` names only `mcp__hive__*` tools from the one `hive` server → test 'every agent runs isolated, on the run model, with only the hive tools'
- [ ] `cleanEnv` drops every `CLAUDE*` and `ANTHROPIC*` variable except `CLAUDE_CONFIG_DIR` → test 'the environment keeps no API key or Claude variables except the config dir'
- [ ] `start` sends the genome turn as the prompt → test 'start sends the genome turn, wake resumes, fork resumes as a fork'
- [ ] `wake` resumes the agent's session → test 'start sends the genome turn, wake resumes, fork resumes as a fork'
- [ ] `fork` resumes the parent's session with `forkSession: true` and returns the child's session → test 'start sends the genome turn, wake resumes, fork resumes as a fork'
- [ ] Usage maps to `{ input, cache_read, cache_write, output }` from the result message → test 'usage comes from the result message in the four fields'
- [ ] A usage-limit error returns `limit: true` → test 'a usage-limit error is reported as limit, not thrown'
- [ ] A tool call resolving `done` interrupts the query → test 'a tool call that ends the wake interrupts the query'
- [ ] `mutate` and `report` run with `allowedTools: []` and return the result text → test 'mutate and report run with no tools'
- [ ] `prompts/ground-rules.md` holds the spec's twelve ground rules word for word
- [ ] No files outside Scope were modified
