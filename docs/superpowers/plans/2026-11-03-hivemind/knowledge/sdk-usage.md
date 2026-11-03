# The Agent SDK as hivemind uses it

Measured with `@anthropic-ai/claude-agent-sdk` 0.3.317 (peer deps installed by npm: `zod` 4.x,
`@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`). `import { query, forkSession, tool,
createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'`.

**Isolation (every agent):**

```js
const options = {
  model, cwd,                               // cwd: the run directory
  env: cleanEnv(),                          // drop every CLAUDE*/ANTHROPIC* var except CLAUDE_CONFIG_DIR
  systemPrompt: GROUND_RULES,               // a string replaces the default prompt
  settingSources: [], strictMcpConfig: true, settings: { autoMemoryEnabled: false },
  mcpServers: { hive: server }, allowedTools: TOOL_NAMES.map((n) => `mcp__hive__${n}`),
  maxTurns,                                 // the burst
};
```

Without `settingSources: []` and `strictMcpConfig: true`, the user's MCP connectors load and an
agent costs hundreds of times more. `tools: []` alone doesn't stop that.

**Custom tools:** `tool(name, description, zodRawShape, async (input) => ({ content: [{ type:
'text', text }] }))`, then `createSdkMcpServer({ name: 'hive', version: '1.0.0', tools, alwaysLoad:
true })`.

**Start, wake, fork:** `query({ prompt, options })` returns an async iterator of messages. Read the
session id from the `system`/`init` message (`m.session_id`). Wake: `options.resume = sessionId`.
Fork: `options.resume = parentId, options.forkSession = true` (the result's `session_id` is the
child's).

**Usage:** take it from the `result` message: `m.usage.input_tokens`,
`m.usage.cache_read_input_tokens`, `m.usage.cache_creation_input_tokens`, `m.usage.output_tokens`.
`total_cost_usd` and `modelUsage` are cumulative over the session and are not used.

**Stop:** `await q.interrupt()` ends the stream fast; the iterator then throws an error result, so
wrap the loop in try/catch. `abortController.abort()` is slower.

**Billing:** runs on the Claude Code login (`apiKeySource: "none"` in the init message); no API key.
The plan's usage limit surfaces as an error result or thrown error whose text mentions the usage
limit or rate limit; `runner-sdk.mjs` classifies it as `limit: true`.

**Costs (one-word replies, Haiku):** an isolated agent's first call writes about 800 tokens of
cache; a resume or a fork within the hour reads that from cache. Ten agents started at once each
pay the cold prefix: start one first, then fan out.
