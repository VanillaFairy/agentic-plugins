# Task T05: Node problems and coverage

rigor: tdd
size: ~23 turns (4 edit sites, 8 files)

## Dispatch
| Stage | Model | Effort | Why |
|---|---|---|---|
| implement | sonnet | medium | rules listed exactly below; 0.2.1's check is the model to follow |
| review | opus | medium | |
| fix | sonnet | medium | |
| re-review | opus | low | |

## References
- Read: `../shared/interfaces.md` § Problems and coverage and § Nodes
- Read: `../shared/architecture.md` § Node roles and their frontmatter

## Dependencies
- Depends on: T01
- Depended on by: T06

## Scope
**Files:**
- Create: `skills/think-tank/scripts/lib/problems.mjs`
- Create: `test/problems.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.** Read `skills/think-tank/scripts/tt.mjs`
(`check`, `REQUIRED`, `parseCheck`, the coverage loop) as the model to port; don't edit it.

## Positive Constraints (DO)
- `nodeProblems(nodes)` returns one `{ node, problem }` per finding, for these and only these:
  1. frontmatter never closed (`n.unclosed`);
  2. a required field missing or `''`, per the Required column of `shared/architecture.md`;
  3. a body link to a node that doesn't exist;
  4. a reference field naming a node that doesn't exist: `answers`, `target`, `refines`,
     `decided_as`, `topic`, `holds`, `duplicate_of`, `extracted_from`, each entry of `needs`, each
     entry of `between`, each entry of a verdict's `addresses`;
  5. a `needs` entry that names a node whose role is not `topic`;
  6. a claim whose `target` is a topic (F1: questions are judged on relevance, never refuted);
  7. a claim with stance `pro` or `con` and no `provenance` (F2);
  8. a claim with provenance `F` and no `source` (F2);
  9. a value outside its set (topic `status` and `outcome`, claim `stance`, `provenance`,
     `verified` and `status`, position `state`, ballot `confidence` not an integer 1–10);
  10. a topic with `status: complete` and no `outcome`;
  11. a topic with `outcome: decided` whose `decided_as` is not a proposal answering it.
- Each problem's text names the field or the rule, e.g. `missing facet`, `needs names q-x-9, which
  is not a topic`, `a claim targets a question; questions are judged on relevance, never refuted (F1)`.
- `cardCoverage(nodes)` ports 0.2.1's coverage: every expert card is checked, through other cards'
  `checks` entries (`"<key>: <direction>"`, an optional `e-` prefix on the key), from at least two
  distinct directions, compared lower-cased; and no two cards share a `lens` (trimmed, lower-cased).
- `castCoverage(nodes, topic)` does the same over the cast only: the cards `e-<key>` for each
  position author `<key>@<anything>` with `topic` equal to the topic. A cast member with no card is
  a problem. Checks count only when the checking card is also in the cast.

## Negative Constraints (DO NOT)
- Do NOT report anything about rounds, phases, standing or released experts: those fields are gone.
- Do NOT read or write files from this module.

## Implementation Steps

### Step 1: Write the failing tests

```js
// test/problems.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeProblems, cardCoverage, castCoverage } from '../skills/think-tank/scripts/lib/problems.mjs';

const graph = (fms, extra = {}) => new Map(Object.entries(fms).map(([id, fm]) => [id, { id, fm, title: id, body: '', links: [], unclosed: false, ...(extra[id] ?? {}) }]));
const of = (nodes, id) => nodeProblems(nodes).filter((p) => p.node === id).map((p) => p.problem).join(' | ');
const card = (lens, checks) => ({ role: 'expert', lens, facets: ['x'], biases: ['b'], checks });
const pos = (author, topic) => ({ role: 'position', topic, state: 'arguing', author });

test('a node with unclosed frontmatter is reported', () => {
  const nodes = graph({ 'q-a-1': { role: 'topic', facet: 'x', status: 'open' } }, { 'q-a-1': { unclosed: true } });
  assert.match(of(nodes, 'q-a-1'), /closing ---/);
});

test('a missing required field is reported for each role', () => {
  const nodes = graph({ 'q-a-1': { role: 'topic', status: 'open' }, 'pos-a-q-a-1': { role: 'position', topic: 'q-a-1' }, 'x-a-1': { role: 'crux', topic: 'q-a-1', between: [] } });
  assert.match(of(nodes, 'q-a-1'), /missing facet/);
  assert.match(of(nodes, 'pos-a-q-a-1'), /missing state/);
  assert.match(of(nodes, 'x-a-1'), /missing (between|decided_by)/);
});

test('a body link naming a missing node is reported', () => {
  const nodes = graph({ 'q-a-1': { role: 'topic', facet: 'x', status: 'open' } }, { 'q-a-1': { links: ['p-gone-9'] } });
  assert.match(of(nodes, 'q-a-1'), /p-gone-9/);
});

// Each reference field, on a node of a role that carries it, naming a node that doesn't exist.
const REFS = [
  ['answers', { role: 'proposal' }],
  ['target', { role: 'claim', stance: 'ask' }],
  ['refines', { role: 'proposal', answers: 'q-ok-1' }],
  ['decided_as', { role: 'topic', facet: 'x', status: 'open' }],
  ['topic', { role: 'position', state: 'arguing' }],
  ['holds', { role: 'position', topic: 'q-ok-1', state: 'arguing' }],
  ['duplicate_of', { role: 'topic', facet: 'x', status: 'open' }],
  ['extracted_from', { role: 'topic', facet: 'x', status: 'open' }],
  ['needs', { role: 'topic', facet: 'x', status: 'open' }, true],
  ['between', { role: 'crux', topic: 'q-ok-1', decided_by: 'a test' }, true],
  ['addresses', { role: 'verdict' }, true],
];
for (const [field, fm, isList] of REFS) {
  test(`a ${field} naming a missing node is reported`, () => {
    const nodes = graph({ 'q-ok-1': { role: 'topic', facet: 'x', status: 'open' }, 'n-x-1': { ...fm, [field]: isList ? ['gone-1'] : 'gone-1' } });
    assert.match(of(nodes, 'n-x-1'), /gone-1/);
  });
}

test('needing something that is not a topic is reported', () => {
  const nodes = graph({ 'q-a-1': { role: 'topic', facet: 'x', status: 'open', needs: ['p-a-1'] }, 'p-a-1': { role: 'proposal', answers: 'q-a-1' } });
  assert.match(of(nodes, 'q-a-1'), /not a topic/);
});

test('a claim aimed at a question is reported, since questions are never refuted', () => {
  const nodes = graph({ 'q-a-1': { role: 'topic', facet: 'x', status: 'open' }, 'c-a-1': { role: 'claim', target: 'q-a-1', stance: 'con', provenance: 'I' } });
  assert.match(of(nodes, 'c-a-1'), /F1/);
});

test('a pro or con claim needs provenance, and an F claim needs a source', () => {
  const nodes = graph({ 'p-a-1': { role: 'proposal', answers: 'q-a-1' }, 'q-a-1': { role: 'topic', facet: 'x', status: 'open' },
    'c-a-1': { role: 'claim', target: 'p-a-1', stance: 'con' }, 'c-a-2': { role: 'claim', target: 'p-a-1', stance: 'pro', provenance: 'F' },
    'c-a-3': { role: 'claim', target: 'p-a-1', stance: 'ask' } });
  assert.match(of(nodes, 'c-a-1'), /provenance/);
  assert.match(of(nodes, 'c-a-2'), /source/);
  assert.equal(of(nodes, 'c-a-3'), '');
});

// Each value set, broken on a node that is otherwise valid.
const SETS = [
  ['topic status', { role: 'topic', facet: 'x', status: 'settled' }, /status/],
  ['topic outcome', { role: 'topic', facet: 'x', status: 'open', outcome: 'won' }, /outcome/],
  ['claim stance', { role: 'claim', target: 'p-ok-1', stance: 'maybe' }, /stance/],
  ['claim provenance', { role: 'claim', target: 'p-ok-1', stance: 'pro', provenance: 'X' }, /provenance/],
  ['claim verified', { role: 'claim', target: 'p-ok-1', stance: 'pro', provenance: 'I', verified: 'sure' }, /verified/],
  ['claim status', { role: 'claim', target: 'p-ok-1', stance: 'pro', provenance: 'I', status: 'gone' }, /status/],
  ['position state', { role: 'position', topic: 'q-ok-1', state: 'thinking' }, /state/],
  ['ballot confidence above 10', { role: 'ballot', topic: 'q-ok-1', confidence: 11 }, /confidence/],
  ['ballot confidence not an integer', { role: 'ballot', topic: 'q-ok-1', confidence: 5.5 }, /confidence/],
];
for (const [name, fm, pattern] of SETS) {
  test(`a ${name} outside its set is reported`, () => {
    const nodes = graph({ 'q-ok-1': { role: 'topic', facet: 'x', status: 'open' }, 'p-ok-1': { role: 'proposal', answers: 'q-ok-1' }, 'n-x-1': fm });
    assert.match(of(nodes, 'n-x-1'), pattern);
  });
}

test('a complete topic needs an outcome, and a decided one a proposal answering it', () => {
  const nodes = graph({ 'q-a-1': { role: 'topic', facet: 'x', status: 'complete' },
    'q-b-1': { role: 'topic', facet: 'x', status: 'complete', outcome: 'decided', decided_as: 'p-a-1' }, 'p-a-1': { role: 'proposal', answers: 'q-a-1' } });
  assert.match(of(nodes, 'q-a-1'), /outcome/);
  assert.match(of(nodes, 'q-b-1'), /decided_as/);
});

test('card coverage needs two checkers from different directions, not just two checkers', () => {
  const twoSame = graph({ 'e-a': card('la', ['b: cost', 'c: cost']), 'e-b': card('lb', ['a: cost', 'c: harm']), 'e-c': card('lc', ['a: cost', 'b: harm']) });
  assert.equal(cardCoverage(twoSame).ok, false);
  const fine = graph({ 'e-a': card('la', ['b: cost', 'c: cost']), 'e-b': card('lb', ['a: cost', 'c: harm']), 'e-c': card('lc', ['a: harm', 'b: growth']) });
  assert.equal(cardCoverage(fine).ok, true);
});

test('two cards with one lens fail card coverage', () => {
  const nodes = graph({ 'e-a': card('Same', ['b: cost', 'c: harm']), 'e-b': card('same ', ['a: cost', 'c: growth']), 'e-c': card('lc', ['a: harm', 'b: growth']) });
  assert.equal(cardCoverage(nodes).ok, false);
});

test('cast coverage counts only checks from cards in the topic's cast', () => {
  const cards = { 'e-a': card('la', ['b: cost', 'c: harm']), 'e-b': card('lb', ['a: cost', 'c: growth']), 'e-c': card('lc', ['a: harm', 'b: growth']) };
  const all = graph({ ...cards, 'q-t-1': { role: 'topic', facet: 'x', status: 'open' }, 'pa': pos('a@q-t-1', 'q-t-1'), 'pb': pos('b@q-t-1', 'q-t-1'), 'pc': pos('c@q-t-1', 'q-t-1') });
  assert.equal(castCoverage(all, 'q-t-1').ok, true);
  const two = graph({ ...cards, 'q-t-1': { role: 'topic', facet: 'x', status: 'open' }, 'pa': pos('a@q-t-1', 'q-t-1'), 'pb': pos('b@q-t-1', 'q-t-1') });
  assert.equal(castCoverage(two, 'q-t-1').ok, false);
});

test('a cast member without a card fails cast coverage', () => {
  const nodes = graph({ 'q-t-1': { role: 'topic', facet: 'x', status: 'open' }, 'pz': pos('zz@q-t-1', 'q-t-1') });
  assert.match(castCoverage(nodes, 'q-t-1').problems.join(' '), /e-zz/);
});
```

### Step 2: Run to verify they fail
Run: `node --test test/problems.test.mjs`
Expected: FAIL, `Cannot find module .../lib/problems.mjs`.

### Step 3: Implement `problems.mjs`
Port 0.2.1's `REQUIRED`, `parseCheck` and coverage loop into the new rules above, importing
`list` and `nodeId` from `./nodes.mjs`. Keep the value sets in one table:

```js
const VALUES = {
  topic: { status: ['open', 'blocked', 'complete'], outcome: ['decided', 'crux', 'ruled', 'set-aside'] },
  claim: { stance: ['pro', 'con', 'ask', 'reply'], provenance: ['F', 'I', 'A'], verified: ['yes', 'no'], status: ['open', 'conceded'] },
  position: { state: ['arguing', 'holding', 'agreeing'] },
};
```

### Step 4: Run to verify they pass
Run: `node --test test/`
Expected: PASS, the whole suite.

### Step 5: Commit
```bash
git add skills/think-tank/scripts/lib/problems.mjs test/problems.test.mjs
git commit -m "Report node problems and expert coverage for the 1.0 graph"
```

## Acceptance Criteria
- [ ] Unclosed frontmatter is reported → test 'a node with unclosed frontmatter is reported'
- [ ] Missing required fields are reported for topic, position and crux → test 'a missing required field is reported for each role'
- [ ] A body link to a missing node is reported → test 'a body link naming a missing node is reported'
- [ ] `answers` naming a missing node is reported → test 'a answers naming a missing node is reported'
- [ ] `target` naming a missing node is reported → test 'a target naming a missing node is reported'
- [ ] `refines` naming a missing node is reported → test 'a refines naming a missing node is reported'
- [ ] `decided_as` naming a missing node is reported → test 'a decided_as naming a missing node is reported'
- [ ] `topic` naming a missing node is reported → test 'a topic naming a missing node is reported'
- [ ] `holds` naming a missing node is reported → test 'a holds naming a missing node is reported'
- [ ] `duplicate_of` naming a missing node is reported → test 'a duplicate_of naming a missing node is reported'
- [ ] `extracted_from` naming a missing node is reported → test 'a extracted_from naming a missing node is reported'
- [ ] A `needs` entry naming a missing node is reported → test 'a needs naming a missing node is reported'
- [ ] A `between` entry naming a missing node is reported → test 'a between naming a missing node is reported'
- [ ] An `addresses` entry naming a missing node is reported → test 'a addresses naming a missing node is reported'
- [ ] A `needs` entry that is not a topic is reported → test 'needing something that is not a topic is reported'
- [ ] A claim on a topic is reported (F1) → test 'a claim aimed at a question is reported, since questions are never refuted'
- [ ] A pro or con claim without provenance, and an F claim without a source, are reported; an ask is not → test 'a pro or con claim needs provenance, and an F claim needs a source'
- [ ] A topic `status` outside its set is reported → test 'a topic status outside its set is reported'
- [ ] A topic `outcome` outside its set is reported → test 'a topic outcome outside its set is reported'
- [ ] A claim `stance` outside its set is reported → test 'a claim stance outside its set is reported'
- [ ] A claim `provenance` outside its set is reported → test 'a claim provenance outside its set is reported'
- [ ] A claim `verified` outside its set is reported → test 'a claim verified outside its set is reported'
- [ ] A claim `status` outside its set is reported → test 'a claim status outside its set is reported'
- [ ] A position `state` outside its set is reported → test 'a position state outside its set is reported'
- [ ] A ballot `confidence` above 10 is reported → test 'a ballot confidence above 10 outside its set is reported'
- [ ] A ballot `confidence` that is not an integer is reported → test 'a ballot confidence not an integer outside its set is reported'
- [ ] Complete without outcome, and decided without a matching proposal, are reported → test 'a complete topic needs an outcome, and a decided one a proposal answering it'
- [ ] Card coverage needs two distinct directions → test 'card coverage needs two checkers from different directions, not just two checkers'
- [ ] Card coverage fails on a shared lens → test 'two cards with one lens fail card coverage'
- [ ] Cast coverage counts only cast cards → test 'cast coverage counts only checks from cards in the topic's cast'
- [ ] A cast member without a card fails cast coverage → test 'a cast member without a card fails cast coverage'
- [ ] No files outside Scope were modified
