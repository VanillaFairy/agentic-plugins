# Task T10: The SDK runner

rigor: tdd
size: ~30 turns (5 edit sites, 12 files)

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
- Note: the ground rules to copy are §10 of `C:\work\claude\vanillafairy\docs\superpowers\specs\2026-11-03-hivemind-design.md`

## Dependencies
- Depends on: T06, T08c
- Depended on by: T12

## Scope
**Files:**
- Create: `src/runner-sdk.mjs`, `test/runner-sdk.test.mjs`
- Create: `prompts/ground-rules.md`: the twelve ground rules of the spec's §10, word for word
- Create: `prompts/reporter.md`: write the report from the input given, in plain language, by
  question; never add, drop or reorder a worldview, crux or answer; say "undecided" for a crux with
  no `decides` claim; end with what the user ruled and what the run spent

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- `createSdkRunner({ dir, physics, sdk })` returns a Runner. `sdk` defaults to the real module
  (`await import('@anthropic-ai/claude-agent-sdk')`); tests pass a fake.
- Options for every call (agents, `mutate`, `report`): the isolation block of
  `knowledge/sdk-usage.md`, `model` and `effort` from `physics.run`, `cwd` = `dir`,
  `env` = `cleanEnv(process.env)`. Agents add `systemPrompt` = `prompts/ground-rules.md`,
  `maxTurns` = `physics.run.burst + 2`, the `hive` server and its `allowedTools`. `mutate` and
  `report` add `allowedTools: []`, no `mcpServers`, `persistSession: false`; `report`'s system
  prompt is `prompts/reporter.md`.
- The physics tools as one `createSdkMcpServer({ name: 'hive', ..., alwaysLoad: true })`, one
  `tool()` per name in `TOOL_NAMES` with a zod schema mirroring the input table; each handler
  calls `tools.call(name, input)` and returns its JSON as text; when it resolves `done`, the runner
  calls `q.interrupt()` once the handler returns.
- Usage: sum `assistant` messages' `message.usage`, each `message.id` once; `context` = the last
  assistant message's input + cache read + cache write.
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
const U = { input_tokens: 2, cache_read_input_tokens: 800, cache_creation_input_tokens: 60, output_tokens: 40 };
const init = (session) => ({ type: 'system', subtype: 'init', session_id: session });
const said = (id, usage = U) => ({ type: 'assistant', message: { id, usage, content: [] } });
const done = (session) => ({ type: 'result', subtype: 'success', session_id: session, usage: U, result: 'ok' });
const ok = (session) => [init(session), said('m1'), done(session)];
const agent = { id: 'a-5', session: 's-parent' };
const tools = { call: async () => ({ ok: true, result: {}, done: false }) };
const isolated = (o) => o.settingSources.length === 0 && o.strictMcpConfig === true && o.settings.autoMemoryEnabled === false;

test('every agent runs isolated, on the run model and effort, with only the hive tools', async () => {
  const sdk = fakeSdk([ok('s-1')]);
  await createSdkRunner({ dir: '/run', physics: P, sdk }).start(agent, 'genome', tools);
  const o = sdk.calls[0].options;
  assert.ok(isolated(o));
  assert.deepEqual([o.model, o.effort], ['opus', 'high']);
  assert.ok(o.allowedTools.length > 0 && o.allowedTools.every((t) => t.startsWith('mcp__hive__')));
  assert.ok(o.mcpServers.hive);
  assert.match(o.systemPrompt, /balance is your life/);
});

test('cleanEnv keeps no API key or Claude variables except the config dir', () => {
  const env = cleanEnv({ PATH: 'p', ANTHROPIC_API_KEY: 'k', CLAUDE_CODE_OAUTH_TOKEN: 't', CLAUDE_CONFIG_DIR: 'c' });
  assert.deepEqual(env, { PATH: 'p', CLAUDE_CONFIG_DIR: 'c' });
});

test('an API key in the shell never reaches an agent', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  try {
    const sdk = fakeSdk([ok('s-1')]);
    await createSdkRunner({ dir: '/run', physics: P, sdk }).start(agent, 'g', tools);
    assert.ok(sdk.calls[0].options.env);
    assert.equal(sdk.calls[0].options.env.ANTHROPIC_API_KEY, undefined);
  } finally { delete process.env.ANTHROPIC_API_KEY; }
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

test('usage is summed over the wake's assistant messages, each once', async () => {
  const sdk = fakeSdk([[init('s-1'), said('m1'), said('m1'), said('m2'), done('s-1')]]);
  const w = await createSdkRunner({ dir: '/run', physics: P, sdk }).start(agent, 'g', tools);
  assert.deepEqual(w.usage, { input: 4, cache_read: 1600, cache_write: 120, output: 80 });
  assert.equal(w.context, 2 + 800 + 60);
});

test('a wake ended by rest still reports its usage', async () => {
  const sdk = fakeSdk([[init('s-1'), said('m1'), { callTool: 'rest' }]]);
  const ends = { call: async () => ({ ok: true, result: {}, done: true }) };
  const w = await createSdkRunner({ dir: '/run', physics: P, sdk }).start(agent, 'g', ends);
  assert.ok(sdk.calls.some((c) => c.interrupt));
  assert.deepEqual(w.usage, { input: 2, cache_read: 800, cache_write: 60, output: 40 });
});

test('a usage-limit error is reported as limit, not thrown', async () => {
  const sdk = fakeSdk([[init('s-1'), new Error('Claude AI usage limit reached')]]);
  const w = await createSdkRunner({ dir: '/run', physics: P, sdk }).wake({ ...agent, session: 's-1' }, 'go', tools);
  assert.equal(w.limit, true);
});

test('mutate and report run isolated with no tools and return text with usage', async () => {
  const sdk = fakeSdk([[said('m1'), { ...done('x'), result: '{"lens":"x"}' }], [said('m2'), { ...done('y'), result: 'REPORT' }]]);
  const r = createSdkRunner({ dir: '/run', physics: P, sdk });
  const m = await r.mutate('m');
  const rep = await r.report('input');
  assert.deepEqual([m.text, rep.text], ['{"lens":"x"}', 'REPORT']);
  assert.equal(m.usage.output, 40);
  for (const c of sdk.calls) { assert.ok(isolated(c.options)); assert.deepEqual(c.options.allowedTools, []); assert.equal(c.options.env.ANTHROPIC_API_KEY, undefined); }
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
- [ ] Every agent call carries the isolation flags, the run model and effort, and the ground rules as system prompt → test 'every agent runs isolated, on the run model and effort, with only the hive tools'
- [ ] `allowedTools` names only `mcp__hive__*` tools from the one `hive` server → test 'every agent runs isolated, on the run model and effort, with only the hive tools'
- [ ] `cleanEnv` drops every `CLAUDE*` and `ANTHROPIC*` variable except `CLAUDE_CONFIG_DIR` → test 'cleanEnv keeps no API key or Claude variables except the config dir'
- [ ] The options' `env` never carries `ANTHROPIC_API_KEY`, even when the shell has one → test 'an API key in the shell never reaches an agent'
- [ ] `start` sends the genome turn as the prompt → test 'start sends the genome turn, wake resumes, fork resumes as a fork'
- [ ] `wake` resumes the agent's session → test 'start sends the genome turn, wake resumes, fork resumes as a fork'
- [ ] `fork` resumes the parent's session with `forkSession: true` and returns the child's session → test 'start sends the genome turn, wake resumes, fork resumes as a fork'
- [ ] Usage is summed over assistant messages, each id once, and `context` is the last call's → test 'usage is summed over the wake's assistant messages, each once'
- [ ] A tool call resolving `done` interrupts the query, and the wake still reports its usage → test 'a wake ended by rest still reports its usage'
- [ ] A usage-limit error returns `limit: true` → test 'a usage-limit error is reported as limit, not thrown'
- [ ] `mutate` and `report` run isolated, with `allowedTools: []` and a clean env, and return `{ text, usage }` → test 'mutate and report run isolated with no tools and return text with usage'
- [ ] `prompts/ground-rules.md` holds the spec's twelve ground rules word for word
- [ ] No files outside Scope were modified
