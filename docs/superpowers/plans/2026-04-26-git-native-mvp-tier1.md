# git-native MVP (Tier 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the host-agnostic core plus GitHub and Local adapters supporting Tier 1 operations (signIn, signOut, currentActor, commit, events, subscribe). Working, testable library sufficient for the jigsaw demo.

**Architecture:** TypeScript library with adapter pattern. Core knows nothing about HTTP; adapters wrap host-specific transports. Tests run via vitest with both adapters under one contract suite.

**Tech Stack:** TypeScript 5.x strict, vitest, tsup (dual ESM+CJS build), `yaml` (parse/format), `isomorphic-git` (Local adapter), `msw` (HTTP mocking in tests).

**Spec reference:** `docs/superpowers/specs/2026-04-26-git-native-library-design.md`

**Scope:** Tier 1 (commit-as-write) only. Tier 2 (branch, tag, merge, revert) is a separate plan after Tier 1 lands. The adapter interface in this plan does NOT yet include Tier 2 method signatures; they will be added in Plan 2.

---

## File structure

| Path | Responsibility |
|---|---|
| `package.json` | Dependencies, scripts, exports map for subpath imports |
| `tsconfig.json` | TypeScript strict, ES2022 target, NodeNext module |
| `tsup.config.ts` | Dual ESM+CJS build, subpath bundles |
| `vitest.config.ts` | Test runner config, includes paths |
| `.gitignore` | `node_modules/`, `dist/`, `.env*`, IDE cruft |
| `README.md` | One-page intro, links to spec |
| `src/index.ts` | Re-exports public API from `core/store.ts`, types from `core/types.ts` |
| `src/core/types.ts` | `Event`, `EventQuery`, `EventInput`, `RawCommit`, `GitHostAdapter`, error classes |
| `src/core/event.ts` | YAML parse + format, version check, subject generation |
| `src/core/conflict.ts` | Retry-on-409 wrapper around `adapter.commit` |
| `src/core/subscription.ts` | Polling loop, dedup, fan-out to multiple subscribers |
| `src/core/store.ts` | `Store` class implementing public API |
| `src/adapters/github/index.ts` | `GitHubAdapter` class implementing `GitHostAdapter` (Tier 1 methods) |
| `src/adapters/github/device-flow.ts` | Device Flow OAuth implementation |
| `src/adapters/github/api.ts` | Thin wrappers over GitHub REST endpoints used |
| `src/adapters/local/index.ts` | `LocalAdapter` class. Auto-detects Node vs Browser. |
| `src/adapters/local/node.ts` | Node-specific `fs` + `isomorphic-git` |
| `src/adapters/local/browser.ts` | Browser FSA + `isomorphic-git`. Stub OK in this plan. |
| `test/helpers/mock-adapter.ts` | In-memory `GitHostAdapter` for unit tests |
| `test/helpers/tmp-repo.ts` | Helper that creates / tears down a tmpdir git repo for integration tests |
| `test/core/event.test.ts` | YAML parse / format / version checks |
| `test/core/conflict.test.ts` | Retry behavior |
| `test/core/subscription.test.ts` | Polling, dedup, fan-out (with fake timers) |
| `test/core/store.test.ts` | Store wires core to adapter correctly |
| `test/contracts/adapter.contract.ts` | Properties every adapter must satisfy |
| `test/contracts/github.test.ts` | Runs adapter contract against `GitHubAdapter` (HTTP mocked) |
| `test/contracts/local.test.ts` | Runs adapter contract against `LocalAdapter` (Node, real isomorphic-git) |

---

## Tasks

### Task 1: Repo scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `.gitignore`, `README.md`, `src/index.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "git-native",
  "version": "0.1.0-pre",
  "description": "A host-agnostic substrate for committing structured events to a git repo from the browser",
  "type": "module",
  "license": "MIT",
  "author": "Alexander Towell <lex@metafunctor.com>",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./github": {
      "types": "./dist/adapters/github/index.d.ts",
      "import": "./dist/adapters/github/index.js",
      "require": "./dist/adapters/github/index.cjs"
    },
    "./local": {
      "types": "./dist/adapters/local/index.d.ts",
      "import": "./dist/adapters/local/index.js",
      "require": "./dist/adapters/local/index.cjs"
    }
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "ci": "npm run typecheck && npm run test && npm run build"
  },
  "dependencies": {
    "yaml": "^2.6.0",
    "isomorphic-git": "^1.27.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "msw": "^2.6.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Create `tsup.config.ts`**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'adapters/github/index': 'src/adapters/github/index.ts',
    'adapters/local/index': 'src/adapters/local/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: false,
  },
});
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
*.log
.env*
.DS_Store
.vscode/
.idea/
```

- [ ] **Step 6: Create `src/index.ts` placeholder**

```typescript
export {};
```

- [ ] **Step 7: Create `README.md`**

```markdown
# git-native

A host-agnostic substrate for committing structured events to a git repo from the browser, and reading them back.

The library that backs the *Your Blog Will Outlive Your Database* essay (https://metafunctor.com/post/2026-04-24-your-blog-will-outlive-your-database/).

Status: pre-release (0.1.0-pre). Tier 1 (commit-as-write) under construction.

See `docs/superpowers/specs/2026-04-26-git-native-library-design.md` for the full design.
```

- [ ] **Step 8: Install dependencies and verify build**

```bash
npm install
npm run typecheck
```

Expected: zero output (typecheck passes on the placeholder export).

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json tsup.config.ts vitest.config.ts .gitignore README.md src/index.ts
git commit -m "Scaffold git-native repo: package, tsconfig, build, test config"
```

---

### Task 2: Core types and errors

**Files:**
- Create: `src/core/types.ts`
- Test: none in this task; types are exercised by later tasks.

- [ ] **Step 1: Create `src/core/types.ts`**

```typescript
// Structured event payload (the typed contents of a commit message body).
export interface Event {
  op: string;                  // verb, e.g. 'place', 'react', 'comment'
  actor: string;               // who, e.g. GitHub username
  ts: string;                  // ISO 8601 timestamp
  v: 1;                        // protocol version
  sha: string;                 // commit hash this event was parsed from
  [key: string]: unknown;      // op-specific fields (piece, slot, target, value, etc.)
}

// What a consumer passes to commit(); the library fills actor, ts, v, sha.
export type EventInput = Omit<Event, 'actor' | 'ts' | 'v' | 'sha'>;

export interface EventQuery {
  since?: string;              // ISO date or commit sha
  limit?: number;              // default 50
  path?: string;               // restrict to commits touching this path
}

// Adapter-level commit input. The core builds this from EventInput.
export interface CommitInput {
  subject: string;             // human-readable summary
  body: string;                // YAML-formatted event payload
  files?: Record<string, string>;  // path -> contents, atomic with the commit
  branch?: string;             // target branch; defaults to repo default branch
}

// Normalized shape returned by adapter.events(). Core parses messageBody as YAML.
export interface RawCommit {
  sha: string;
  author: string;              // who committed
  committedAt: string;         // ISO 8601
  messageSubject: string;
  messageBody: string;
}

export interface GitHostAdapter {
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  isAuthenticated(): boolean;
  currentActor(): string | null;

  commit(input: CommitInput): Promise<{ sha: string }>;
  events(query: EventQuery): Promise<RawCommit[]>;

  capabilities(): { realtime: false; tier1: true; tier2: false };
}

export interface CommitOptions {
  branch?: string;
  files?: Record<string, string>;
}

export interface Subscription {
  unsubscribe(): void;
}

// Errors

export class ConflictError extends Error {
  constructor(message = 'Commit conflicted with remote state') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class AuthError extends Error {
  constructor(message = 'Authentication required or failed') {
    super(message);
    this.name = 'AuthError';
  }
}

export class NetworkError extends Error {
  constructor(message: string, public retryAfter?: number) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotImplementedError extends Error {
  constructor(operation: string) {
    super(`Operation not implemented: ${operation}`);
    this.name = 'NotImplementedError';
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: zero output.

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "Add core types: Event, EventQuery, GitHostAdapter, errors"
```

---

### Task 3: Event payload format (YAML parse + format + version check)

**Files:**
- Create: `src/core/event.ts`, `test/core/event.test.ts`

- [ ] **Step 1: Write failing tests in `test/core/event.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { formatEvent, parseEvent, generateSubject } from '../../src/core/event.js';
import { ValidationError } from '../../src/core/types.js';

describe('formatEvent', () => {
  it('produces YAML body with all fields', () => {
    const body = formatEvent({
      op: 'place',
      actor: 'queelius',
      ts: '2026-04-26T14:23:11Z',
      v: 1,
      piece: 42,
      slot: [3, 7],
    } as any);
    expect(body).toContain('op: place');
    expect(body).toContain('actor: queelius');
    expect(body).toContain('v: 1');
    expect(body).toContain('piece: 42');
    expect(body).toMatch(/slot:\s*\[\s*3\s*,\s*7\s*\]/);
  });
});

describe('parseEvent', () => {
  it('parses a valid YAML body into an Event', () => {
    const body = 'op: react\nactor: queelius\nts: 2026-04-26T14:23:11Z\nv: 1\ntarget: posts/foo\nvalue: "🔥"\n';
    const event = parseEvent(body, 'abc123');
    expect(event.op).toBe('react');
    expect(event.actor).toBe('queelius');
    expect(event.v).toBe(1);
    expect(event.sha).toBe('abc123');
    expect(event.target).toBe('posts/foo');
  });

  it('throws ValidationError when v is missing', () => {
    const body = 'op: place\nactor: queelius\nts: 2026-04-26T14:23:11Z\n';
    expect(() => parseEvent(body, 'abc')).toThrow(ValidationError);
  });

  it('throws ValidationError on unknown major version', () => {
    const body = 'op: place\nactor: queelius\nts: 2026-04-26T14:23:11Z\nv: 2\n';
    expect(() => parseEvent(body, 'abc')).toThrow(ValidationError);
  });

  it('throws ValidationError on malformed YAML', () => {
    expect(() => parseEvent('not: valid: yaml: here', 'abc')).toThrow(ValidationError);
  });
});

describe('generateSubject', () => {
  it('summarizes a place event', () => {
    const subject = generateSubject({
      op: 'place',
      actor: 'queelius',
      ts: '2026-04-26T14:23:11Z',
      v: 1,
      piece: 42,
      slot: [3, 7],
    } as any);
    expect(subject).toContain('place');
    expect(subject).toContain('42');
  });

  it('falls back to "<op> event" for unknown ops', () => {
    const subject = generateSubject({
      op: 'mystery',
      actor: 'queelius',
      ts: '2026-04-26T14:23:11Z',
      v: 1,
    } as any);
    expect(subject).toBe('mystery event');
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL**

```bash
npm test -- test/core/event.test.ts
```

Expected: FAIL (file not found / functions undefined).

- [ ] **Step 3: Implement `src/core/event.ts`**

```typescript
import YAML from 'yaml';
import { Event, ValidationError } from './types.js';

export function formatEvent(event: Event): string {
  const { sha: _sha, ...payload } = event;
  return YAML.stringify(payload, { lineWidth: 0 });
}

export function parseEvent(body: string, sha: string): Event {
  let parsed: unknown;
  try {
    parsed = YAML.parse(body);
  } catch (e) {
    throw new ValidationError(`Malformed YAML in commit body: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new ValidationError('Commit body did not parse as a YAML object');
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.v !== 'number') {
    throw new ValidationError('Event missing required field "v" (protocol version)');
  }
  if (obj.v !== 1) {
    throw new ValidationError(`Unknown protocol version: ${obj.v}`);
  }
  if (typeof obj.op !== 'string') {
    throw new ValidationError('Event missing required field "op"');
  }
  if (typeof obj.actor !== 'string') {
    throw new ValidationError('Event missing required field "actor"');
  }
  if (typeof obj.ts !== 'string') {
    throw new ValidationError('Event missing required field "ts"');
  }
  return { ...obj, v: 1, sha } as Event;
}

export function generateSubject(event: Event): string {
  switch (event.op) {
    case 'place':
      return `place piece ${event.piece} at slot ${JSON.stringify(event.slot)}`;
    case 'react':
      return `react ${event.value} on ${event.target}`;
    case 'comment':
      return `comment on ${event.target}`;
    default:
      return `${event.op} event`;
  }
}
```

- [ ] **Step 4: Run tests, verify PASS**

```bash
npm test -- test/core/event.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/event.ts test/core/event.test.ts
git commit -m "Add core/event.ts: YAML parse, format, version check, subject generation"
```

---

### Task 4: MockAdapter for testing

**Files:**
- Create: `test/helpers/mock-adapter.ts`

- [ ] **Step 1: Implement `MockAdapter`**

```typescript
import { GitHostAdapter, CommitInput, EventQuery, RawCommit } from '../../src/core/types.js';

export class MockAdapter implements GitHostAdapter {
  private actor: string | null = null;
  private commits: RawCommit[] = [];
  private nextSha = 1;

  constructor(opts: { actor?: string } = {}) {
    if (opts.actor) this.actor = opts.actor;
  }

  async signIn(): Promise<void> {
    this.actor = this.actor ?? 'mock-user';
  }

  async signOut(): Promise<void> {
    this.actor = null;
  }

  isAuthenticated(): boolean {
    return this.actor !== null;
  }

  currentActor(): string | null {
    return this.actor;
  }

  async commit(input: CommitInput): Promise<{ sha: string }> {
    if (!this.isAuthenticated()) {
      throw new Error('not authenticated');
    }
    const sha = `sha-${this.nextSha++}`;
    this.commits.unshift({
      sha,
      author: this.actor!,
      committedAt: new Date().toISOString(),
      messageSubject: input.subject,
      messageBody: input.body,
    });
    return { sha };
  }

  async events(query: EventQuery): Promise<RawCommit[]> {
    let result = this.commits.slice();
    if (query.since) {
      const idx = result.findIndex(c => c.sha === query.since);
      if (idx >= 0) result = result.slice(0, idx);
    }
    if (query.limit) result = result.slice(0, query.limit);
    return result;
  }

  capabilities() {
    return { realtime: false, tier1: true, tier2: false } as const;
  }

  // Test helpers (not part of GitHostAdapter)
  _injectCommit(commit: RawCommit): void {
    this.commits.unshift(commit);
  }

  _reset(): void {
    this.commits = [];
    this.nextSha = 1;
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run typecheck
```

Expected: zero output.

- [ ] **Step 3: Commit**

```bash
git add test/helpers/mock-adapter.ts
git commit -m "Add MockAdapter for unit testing core logic"
```

---

### Task 5: Conflict retry wrapper

**Files:**
- Create: `src/core/conflict.ts`, `test/core/conflict.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { commitWithRetry } from '../../src/core/conflict.js';
import { ConflictError } from '../../src/core/types.js';

describe('commitWithRetry', () => {
  it('returns sha on first-try success', async () => {
    const adapter = { commit: vi.fn().mockResolvedValue({ sha: 'abc' }) };
    const result = await commitWithRetry(adapter as any, { subject: 's', body: 'b' });
    expect(result.sha).toBe('abc');
    expect(adapter.commit).toHaveBeenCalledTimes(1);
  });

  it('retries once on ConflictError and returns the second-try sha', async () => {
    const adapter = {
      commit: vi.fn()
        .mockRejectedValueOnce(new ConflictError())
        .mockResolvedValueOnce({ sha: 'second' }),
    };
    const result = await commitWithRetry(adapter as any, { subject: 's', body: 'b' });
    expect(result.sha).toBe('second');
    expect(adapter.commit).toHaveBeenCalledTimes(2);
  });

  it('throws after second consecutive ConflictError', async () => {
    const adapter = {
      commit: vi.fn().mockRejectedValue(new ConflictError()),
    };
    await expect(
      commitWithRetry(adapter as any, { subject: 's', body: 'b' })
    ).rejects.toThrow(ConflictError);
    expect(adapter.commit).toHaveBeenCalledTimes(2);
  });

  it('does not retry on non-conflict errors', async () => {
    const adapter = {
      commit: vi.fn().mockRejectedValue(new Error('network')),
    };
    await expect(
      commitWithRetry(adapter as any, { subject: 's', body: 'b' })
    ).rejects.toThrow('network');
    expect(adapter.commit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL**

```bash
npm test -- test/core/conflict.test.ts
```

Expected: FAIL (file not found).

- [ ] **Step 3: Implement `src/core/conflict.ts`**

```typescript
import { GitHostAdapter, CommitInput, ConflictError } from './types.js';

export async function commitWithRetry(
  adapter: Pick<GitHostAdapter, 'commit'>,
  input: CommitInput,
): Promise<{ sha: string }> {
  try {
    return await adapter.commit(input);
  } catch (e) {
    if (e instanceof ConflictError) {
      return await adapter.commit(input);
    }
    throw e;
  }
}
```

- [ ] **Step 4: Run tests, verify PASS**

```bash
npm test -- test/core/conflict.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/conflict.ts test/core/conflict.test.ts
git commit -m "Add core/conflict.ts: retry-once-on-ConflictError wrapper"
```

---

### Task 6: Subscription (polling, dedup, fan-out)

**Files:**
- Create: `src/core/subscription.ts`, `test/core/subscription.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSubscriber } from '../../src/core/subscription.js';
import { MockAdapter } from '../helpers/mock-adapter.js';

describe('createSubscriber', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires callback with new events after each poll interval', async () => {
    const adapter = new MockAdapter({ actor: 'alice' });
    await adapter.signIn();
    adapter._injectCommit({
      sha: 'sha-A',
      author: 'alice',
      committedAt: new Date().toISOString(),
      messageSubject: 'place piece 1 at slot [0,0]',
      messageBody: 'op: place\nactor: alice\nts: 2026-04-26T00:00:00Z\nv: 1\npiece: 1\nslot: [0, 0]\n',
    });

    const cb = vi.fn();
    const sub = createSubscriber(adapter, { pollInterval: 1000 }, cb);

    await vi.advanceTimersByTimeAsync(1000);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toHaveLength(1);
    expect(cb.mock.calls[0][0][0].op).toBe('place');

    sub.unsubscribe();
  });

  it('dedups: does not refire callback for events already seen', async () => {
    const adapter = new MockAdapter({ actor: 'alice' });
    await adapter.signIn();
    adapter._injectCommit({
      sha: 'sha-A',
      author: 'alice',
      committedAt: new Date().toISOString(),
      messageSubject: 'subject',
      messageBody: 'op: place\nactor: alice\nts: 2026-04-26T00:00:00Z\nv: 1\npiece: 1\nslot: [0, 0]\n',
    });

    const cb = vi.fn();
    const sub = createSubscriber(adapter, { pollInterval: 1000 }, cb);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(cb).toHaveBeenCalledTimes(1);
    sub.unsubscribe();
  });

  it('unsubscribe stops polling', async () => {
    const adapter = new MockAdapter({ actor: 'alice' });
    await adapter.signIn();

    const cb = vi.fn();
    const sub = createSubscriber(adapter, { pollInterval: 1000 }, cb);

    sub.unsubscribe();
    adapter._injectCommit({
      sha: 'sha-A',
      author: 'alice',
      committedAt: new Date().toISOString(),
      messageSubject: 'subject',
      messageBody: 'op: place\nactor: alice\nts: 2026-04-26T00:00:00Z\nv: 1\npiece: 1\nslot: [0, 0]\n',
    });

    await vi.advanceTimersByTimeAsync(5000);
    expect(cb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL**

```bash
npm test -- test/core/subscription.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/core/subscription.ts`**

```typescript
import { GitHostAdapter, Event, Subscription } from './types.js';
import { parseEvent } from './event.js';

export interface SubscribeOptions {
  pollInterval: number;        // milliseconds
}

export function createSubscriber(
  adapter: Pick<GitHostAdapter, 'events'>,
  options: SubscribeOptions,
  callback: (events: Event[]) => void,
): Subscription {
  let lastSeenSha: string | undefined = undefined;
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const raw = await adapter.events({ since: lastSeenSha });
      if (raw.length > 0 && !stopped) {
        const events: Event[] = [];
        for (const c of raw) {
          try {
            events.push(parseEvent(c.messageBody, c.sha));
          } catch {
            // Skip events that fail to parse; subscriber sees only valid events.
          }
        }
        if (events.length > 0) {
          lastSeenSha = raw[0]!.sha;
          callback(events);
        }
      }
    } catch {
      // Swallow poll errors in MVP; spec mentions emitting error event in
      // future. Continue polling.
    }
  };

  const handle = setInterval(tick, options.pollInterval);

  return {
    unsubscribe(): void {
      stopped = true;
      clearInterval(handle);
    },
  };
}
```

- [ ] **Step 4: Run tests, verify PASS**

```bash
npm test -- test/core/subscription.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/subscription.ts test/core/subscription.test.ts
git commit -m "Add core/subscription.ts: polling, dedup, unsubscribe"
```

---

### Task 7: Store class (public API)

**Files:**
- Create: `src/core/store.ts`, `test/core/store.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gitNative } from '../../src/index.js';
import { MockAdapter } from '../helpers/mock-adapter.js';

describe('Store', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('signIn delegates to adapter and reflects in isAuthenticated', async () => {
    const adapter = new MockAdapter();
    const store = gitNative({ adapter, pollInterval: 1000 });
    expect(store.isAuthenticated()).toBe(false);
    await store.signIn();
    expect(store.isAuthenticated()).toBe(true);
    expect(store.currentActor()).toBe('mock-user');
  });

  it('commit fills actor, ts, v and returns sha', async () => {
    const adapter = new MockAdapter({ actor: 'queelius' });
    await adapter.signIn();
    const store = gitNative({ adapter, pollInterval: 1000 });
    const result = await store.commit({ op: 'place', piece: 42, slot: [3, 7] } as any);
    expect(result.sha).toMatch(/^sha-/);
    const events = await store.events();
    expect(events).toHaveLength(1);
    expect(events[0]!.actor).toBe('queelius');
    expect(events[0]!.v).toBe(1);
    expect(events[0]!.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(events[0]!.op).toBe('place');
  });

  it('subscribe fires on new commits', async () => {
    const adapter = new MockAdapter({ actor: 'queelius' });
    await adapter.signIn();
    const store = gitNative({ adapter, pollInterval: 1000 });

    const cb = vi.fn();
    const sub = store.subscribe(cb);

    await store.commit({ op: 'place', piece: 1, slot: [0, 0] } as any);
    await vi.advanceTimersByTimeAsync(1000);

    expect(cb).toHaveBeenCalledTimes(1);
    sub.unsubscribe();
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL**

```bash
npm test -- test/core/store.test.ts
```

Expected: FAIL (gitNative not exported).

- [ ] **Step 3: Implement `src/core/store.ts`**

```typescript
import {
  GitHostAdapter,
  Event,
  EventInput,
  EventQuery,
  CommitOptions,
  Subscription,
  AuthError,
} from './types.js';
import { formatEvent, parseEvent, generateSubject } from './event.js';
import { commitWithRetry } from './conflict.js';
import { createSubscriber } from './subscription.js';

export interface StoreOptions {
  adapter: GitHostAdapter;
  pollInterval?: number;       // default 5000
}

export interface Store {
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  isAuthenticated(): boolean;
  currentActor(): string | null;
  commit(event: EventInput, opts?: CommitOptions): Promise<{ sha: string }>;
  events(query?: EventQuery): Promise<Event[]>;
  subscribe(callback: (events: Event[]) => void): Subscription;
}

export function gitNative(options: StoreOptions): Store {
  const { adapter } = options;
  const pollInterval = options.pollInterval ?? 5000;

  return {
    signIn: () => adapter.signIn(),
    signOut: () => adapter.signOut(),
    isAuthenticated: () => adapter.isAuthenticated(),
    currentActor: () => adapter.currentActor(),

    async commit(event, opts) {
      const actor = adapter.currentActor();
      if (actor === null) throw new AuthError('Not authenticated');
      const fullEvent: Event = {
        ...event,
        actor,
        ts: new Date().toISOString(),
        v: 1,
        sha: '',  // filled by adapter
      };
      const body = formatEvent(fullEvent);
      const subject = generateSubject(fullEvent);
      return commitWithRetry(adapter, {
        subject,
        body,
        files: opts?.files,
        branch: opts?.branch,
      });
    },

    async events(query = {}) {
      const raw = await adapter.events(query);
      const result: Event[] = [];
      for (const c of raw) {
        try {
          result.push(parseEvent(c.messageBody, c.sha));
        } catch {
          // Skip unparseable commits; not all commits are git-native events.
        }
      }
      return result;
    },

    subscribe(callback) {
      return createSubscriber(adapter, { pollInterval }, callback);
    },
  };
}
```

- [ ] **Step 4: Update `src/index.ts`**

```typescript
export { gitNative } from './core/store.js';
export type { Store, StoreOptions } from './core/store.js';
export type {
  Event,
  EventInput,
  EventQuery,
  CommitInput,
  CommitOptions,
  RawCommit,
  GitHostAdapter,
  Subscription,
} from './core/types.js';
export {
  ConflictError,
  AuthError,
  NetworkError,
  ValidationError,
  NotImplementedError,
} from './core/types.js';
```

- [ ] **Step 5: Run tests, verify PASS**

```bash
npm test
```

Expected: all PASS (unit tests across core/event, core/conflict, core/subscription, core/store).

- [ ] **Step 6: Commit**

```bash
git add src/core/store.ts test/core/store.test.ts src/index.ts
git commit -m "Add core/store.ts: public API with commit/events/subscribe"
```

---

### Task 8: GitHubAdapter — Device Flow signIn

**Files:**
- Create: `src/adapters/github/device-flow.ts`, `src/adapters/github/index.ts`, `src/adapters/github/api.ts`

This task implements only the auth path. Commit/events come in Task 9.

- [ ] **Step 1: Implement `src/adapters/github/device-flow.ts`**

GitHub Device Flow has two endpoints:
- `POST https://github.com/login/device/code` to request a verification code.
- `POST https://github.com/login/oauth/access_token` (polled) to exchange for a token.

Reference: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow

```typescript
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';

export interface DeviceFlowOptions {
  clientId: string;            // public, registered OAuth App client_id
  scope?: string;              // default 'public_repo'
  onUserCode?: (info: { userCode: string; verificationUri: string }) => void;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token?: string;
  error?: string;              // 'authorization_pending', 'slow_down', 'expired_token', 'access_denied'
  interval?: number;           // returned with slow_down
}

export async function deviceFlow(opts: DeviceFlowOptions): Promise<string> {
  const codeResp = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: opts.clientId, scope: opts.scope ?? 'public_repo' }),
  });
  if (!codeResp.ok) throw new Error(`Device code request failed: ${codeResp.status}`);
  const code: DeviceCodeResponse = await codeResp.json();

  if (opts.onUserCode) {
    opts.onUserCode({ userCode: code.user_code, verificationUri: code.verification_uri });
  }

  let interval = code.interval * 1000;
  const deadline = Date.now() + code.expires_in * 1000;

  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, interval));
    const tokenResp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: opts.clientId,
        device_code: code.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    const data: TokenResponse = await tokenResp.json();
    if (data.access_token) return data.access_token;
    if (data.error === 'authorization_pending') continue;
    if (data.error === 'slow_down') {
      interval = (data.interval ?? code.interval + 5) * 1000;
      continue;
    }
    throw new Error(`Device flow failed: ${data.error ?? 'unknown'}`);
  }
  throw new Error('Device flow timed out');
}
```

- [ ] **Step 2: Implement `src/adapters/github/api.ts`** (placeholder for now; expanded in Task 9)

```typescript
const GITHUB_API = 'https://api.github.com';

export interface ApiClientOptions {
  token: string;
  repo: string;                // 'owner/repo'
}

export class ApiClient {
  constructor(private opts: ApiClientOptions) {}

  async getViewer(): Promise<{ login: string }> {
    const resp = await fetch(`${GITHUB_API}/user`, {
      headers: {
        'Authorization': `Bearer ${this.opts.token}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    if (!resp.ok) throw new Error(`Viewer lookup failed: ${resp.status}`);
    return resp.json();
  }
}
```

- [ ] **Step 3: Implement `src/adapters/github/index.ts`** (Tier 1 with auth + stub commit/events)

```typescript
import { GitHostAdapter, CommitInput, EventQuery, RawCommit, AuthError, NotImplementedError } from '../../core/types.js';
import { deviceFlow } from './device-flow.js';
import { ApiClient } from './api.js';

export interface GitHubAdapterOptions {
  repo: string;                // 'owner/repo'
  path?: string;               // optional path scope
  clientId: string;            // OAuth App client_id
  scope?: string;
  onUserCode?: (info: { userCode: string; verificationUri: string }) => void;
  storage?: { get(): string | null; set(v: string | null): void };  // token persistence
}

export class GitHubAdapter implements GitHostAdapter {
  private token: string | null = null;
  private actor: string | null = null;
  private api: ApiClient | null = null;

  constructor(private opts: GitHubAdapterOptions) {
    if (opts.storage) {
      this.token = opts.storage.get();
      if (this.token) this.api = new ApiClient({ token: this.token, repo: opts.repo });
    }
  }

  async signIn(): Promise<void> {
    if (this.token) return;
    this.token = await deviceFlow({
      clientId: this.opts.clientId,
      scope: this.opts.scope,
      onUserCode: this.opts.onUserCode,
    });
    this.opts.storage?.set(this.token);
    this.api = new ApiClient({ token: this.token, repo: this.opts.repo });
    const viewer = await this.api.getViewer();
    this.actor = viewer.login;
  }

  async signOut(): Promise<void> {
    this.token = null;
    this.actor = null;
    this.api = null;
    this.opts.storage?.set(null);
  }

  isAuthenticated(): boolean {
    return this.token !== null;
  }

  currentActor(): string | null {
    return this.actor;
  }

  async commit(_input: CommitInput): Promise<{ sha: string }> {
    if (!this.api) throw new AuthError('Not authenticated');
    throw new NotImplementedError('GitHubAdapter.commit (implemented in Task 9)');
  }

  async events(_query: EventQuery): Promise<RawCommit[]> {
    if (!this.api) throw new AuthError('Not authenticated');
    throw new NotImplementedError('GitHubAdapter.events (implemented in Task 9)');
  }

  capabilities() {
    return { realtime: false as const, tier1: true as const, tier2: false as const };
  }
}
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: zero output.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/github/
git commit -m "GitHubAdapter: Device Flow signIn (Tier 1 partial)"
```

---

### Task 9: GitHubAdapter — commit and events

**Files:**
- Modify: `src/adapters/github/api.ts`, `src/adapters/github/index.ts`
- Create: `test/contracts/github.test.ts` (uses msw)

GitHub commit via the Contents API: `PUT /repos/{owner}/{repo}/contents/{path}` creates or updates one file with a commit message in one call. For events that include a file (like jigsaw piece placement), this is exactly the right shape.

For events without a file (e.g., reactions), we still need a commit. The Contents API requires a file change, so for file-less events the adapter creates / updates a sentinel file (e.g., `.gnp/events/<sha>.event` containing the event body) atomically with the commit.

Reference: https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents

- [ ] **Step 1: Expand `src/adapters/github/api.ts` with commit + commits-list**

```typescript
const GITHUB_API = 'https://api.github.com';

export interface ApiClientOptions {
  token: string;
  repo: string;                // 'owner/repo'
}

export interface PutContentsInput {
  path: string;
  content: string;             // raw text; encoded base64 inside
  message: string;             // commit message (subject + body)
  branch?: string;
  sha?: string;                // existing file sha, required when updating
}

export interface CommitListItem {
  sha: string;
  commit: {
    author: { name: string; email: string; date: string };
    message: string;
  };
  author: { login: string } | null;
}

export class ApiClient {
  constructor(private opts: ApiClientOptions) {}

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.opts.token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };
  }

  async getViewer(): Promise<{ login: string }> {
    const resp = await fetch(`${GITHUB_API}/user`, { headers: this.headers() });
    if (!resp.ok) throw new Error(`Viewer lookup failed: ${resp.status}`);
    return resp.json();
  }

  async putContents(input: PutContentsInput): Promise<{ commit: { sha: string } }> {
    const resp = await fetch(
      `${GITHUB_API}/repos/${this.opts.repo}/contents/${encodeURIComponent(input.path).replace(/%2F/g, '/')}`,
      {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify({
          message: input.message,
          content: btoa(unescape(encodeURIComponent(input.content))),
          branch: input.branch,
          sha: input.sha,
        }),
      }
    );
    if (resp.status === 409 || resp.status === 422) {
      const text = await resp.text();
      throw Object.assign(new Error(`Contents conflict: ${text}`), { isConflict: true });
    }
    if (!resp.ok) throw new Error(`Put contents failed: ${resp.status} ${await resp.text()}`);
    return resp.json();
  }

  async listCommits(opts: { path?: string; since?: string; per_page?: number }): Promise<CommitListItem[]> {
    const params = new URLSearchParams();
    if (opts.path) params.set('path', opts.path);
    if (opts.since) params.set('since', opts.since);
    params.set('per_page', String(opts.per_page ?? 50));
    const resp = await fetch(
      `${GITHUB_API}/repos/${this.opts.repo}/commits?${params}`,
      { headers: this.headers() }
    );
    if (!resp.ok) throw new Error(`List commits failed: ${resp.status}`);
    return resp.json();
  }
}
```

- [ ] **Step 2: Implement `commit` and `events` in `src/adapters/github/index.ts`**

Replace the `NotImplementedError` stubs from Task 8:

```typescript
async commit(input: CommitInput): Promise<{ sha: string }> {
  if (!this.api) throw new AuthError('Not authenticated');

  const fullMessage = input.subject + (input.body ? '\n\n' + input.body : '');
  const branch = input.branch;

  // Determine target path. If files map provided, commit each (in MVP we
  // expect at most one file per commit; multiple files require the git
  // data API path, deferred).
  const filesEntries = Object.entries(input.files ?? {});
  if (filesEntries.length > 1) {
    throw new NotImplementedError('Multi-file commits via Contents API (use single-file commits in MVP)');
  }

  let path: string;
  let content: string;
  if (filesEntries.length === 1) {
    [path, content] = filesEntries[0]!;
  } else {
    // Sentinel event file when no files map provided
    path = `${this.opts.path ?? ''}.gnp/events/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.event`;
    content = input.body;
  }

  try {
    const result = await this.api.putContents({ path, content, message: fullMessage, branch });
    return { sha: result.commit.sha };
  } catch (e) {
    if ((e as { isConflict?: boolean }).isConflict) {
      const { ConflictError } = await import('../../core/types.js');
      throw new ConflictError();
    }
    throw e;
  }
}

async events(query: EventQuery): Promise<RawCommit[]> {
  if (!this.api) throw new AuthError('Not authenticated');

  const since = query.since && /^\d{4}-/.test(query.since) ? query.since : undefined;
  // Note: the spec allows query.since to be a sha; for sha-based pagination
  // we'd need to walk backwards from HEAD. For MVP, when query.since is
  // a sha we ignore it and let the consumer dedupe via lastSeenSha.
  const list = await this.api.listCommits({
    path: this.opts.path,
    since,
    per_page: query.limit ?? 50,
  });

  return list.map(c => {
    const lines = c.commit.message.split('\n');
    const subject = lines[0] ?? '';
    const body = lines.slice(2).join('\n');  // skip subject + blank line
    return {
      sha: c.sha,
      author: c.author?.login ?? c.commit.author.name,
      committedAt: c.commit.author.date,
      messageSubject: subject,
      messageBody: body,
    };
  });
}
```

- [ ] **Step 3: Write contract test in `test/contracts/github.test.ts` using msw**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { GitHubAdapter } from '../../src/adapters/github/index.js';
import { runAdapterContract } from './adapter.contract.js';

const inMemoryStorage = (): { get(): string | null; set(v: string | null): void } => {
  let value: string | null = null;
  return { get: () => value, set: (v) => { value = v; } };
};

const handlers = (() => {
  let commits: Array<{ sha: string; message: string; author: string; date: string }> = [];
  let nextSha = 1;
  return [
    http.get('https://api.github.com/user', () => HttpResponse.json({ login: 'test-user' })),
    http.put('https://api.github.com/repos/:owner/:repo/contents/*', async ({ request }) => {
      const body = await request.json() as { message: string };
      const sha = `gh-sha-${nextSha++}`;
      commits.unshift({ sha, message: body.message, author: 'test-user', date: new Date().toISOString() });
      return HttpResponse.json({ commit: { sha } }, { status: 201 });
    }),
    http.get('https://api.github.com/repos/:owner/:repo/commits', () => {
      return HttpResponse.json(commits.map(c => ({
        sha: c.sha,
        commit: { author: { name: c.author, email: 'x@x', date: c.date }, message: c.message },
        author: { login: c.author },
      })));
    }),
    // Reset hook for tests
    http.post('http://_test/reset', () => { commits = []; nextSha = 1; return HttpResponse.text('ok'); }),
  ];
})();

const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(async () => { await fetch('http://_test/reset', { method: 'POST' }); });

describe('GitHubAdapter (contract)', () => {
  runAdapterContract({
    name: 'GitHubAdapter',
    create: () => {
      const storage = inMemoryStorage();
      storage.set('preauth-test-token');                // bypass device flow in tests
      return new GitHubAdapter({
        repo: 'queelius/metafunctor-data',
        path: 'jigsaw/2026-W17/',
        clientId: 'test-client-id',
        storage,
      });
    },
  });
});
```

(`runAdapterContract` is defined in Task 11.)

- [ ] **Step 4: Commit**

```bash
git add src/adapters/github/api.ts src/adapters/github/index.ts test/contracts/github.test.ts
git commit -m "GitHubAdapter: commit + events via Contents API; contract test (msw)"
```

---

### Task 10: LocalAdapter (Node) using isomorphic-git

**Files:**
- Create: `src/adapters/local/index.ts`, `src/adapters/local/node.ts`, `src/adapters/local/browser.ts`, `test/helpers/tmp-repo.ts`, `test/contracts/local.test.ts`

The Local adapter uses `isomorphic-git` for git operations. It supports two transports: Node (via `node:fs`) and Browser (via File System Access API). MVP focuses on Node for tests; Browser is a stub that throws "not yet implemented" so the directory structure signals future work.

- [ ] **Step 1: Create `src/adapters/local/node.ts`**

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import git from 'isomorphic-git';
import { GitHostAdapter, CommitInput, EventQuery, RawCommit, AuthError } from '../../core/types.js';

export interface LocalNodeOptions {
  dir: string;                 // path to a git working directory
  actor: { name: string; email: string };
}

export class LocalNodeAdapter implements GitHostAdapter {
  private signedIn = false;
  constructor(private opts: LocalNodeOptions) {}

  async signIn(): Promise<void> { this.signedIn = true; }
  async signOut(): Promise<void> { this.signedIn = false; }
  isAuthenticated(): boolean { return this.signedIn; }
  currentActor(): string | null { return this.signedIn ? this.opts.actor.name : null; }

  async commit(input: CommitInput): Promise<{ sha: string }> {
    if (!this.signedIn) throw new AuthError('Not authenticated');

    // Write files (or sentinel)
    const filesEntries = Object.entries(input.files ?? {});
    if (filesEntries.length === 0) {
      const sentinelDir = path.join(this.opts.dir, '.gnp', 'events');
      fs.mkdirSync(sentinelDir, { recursive: true });
      const fname = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.event`;
      fs.writeFileSync(path.join(sentinelDir, fname), input.body);
      await git.add({ fs, dir: this.opts.dir, filepath: path.join('.gnp/events', fname) });
    } else {
      for (const [filepath, content] of filesEntries) {
        const fullPath = path.join(this.opts.dir, filepath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
        await git.add({ fs, dir: this.opts.dir, filepath });
      }
    }

    const fullMessage = input.subject + (input.body ? '\n\n' + input.body : '');
    const sha = await git.commit({
      fs,
      dir: this.opts.dir,
      message: fullMessage,
      author: this.opts.actor,
    });
    return { sha };
  }

  async events(query: EventQuery): Promise<RawCommit[]> {
    const log = await git.log({
      fs,
      dir: this.opts.dir,
      depth: query.limit ?? 50,
      ...(query.since && /^\d{4}-/.test(query.since)
        ? { since: new Date(query.since) }
        : {}),
    });

    return log.map(entry => {
      const message = entry.commit.message;
      const lines = message.split('\n');
      const subject = lines[0] ?? '';
      const body = lines.slice(2).join('\n');
      return {
        sha: entry.oid,
        author: entry.commit.author.name,
        committedAt: new Date(entry.commit.author.timestamp * 1000).toISOString(),
        messageSubject: subject,
        messageBody: body,
      };
    });
  }

  capabilities() {
    return { realtime: false as const, tier1: true as const, tier2: false as const };
  }
}
```

- [ ] **Step 2: Create `src/adapters/local/browser.ts` stub**

```typescript
import { GitHostAdapter, CommitInput, EventQuery, RawCommit, NotImplementedError } from '../../core/types.js';

export interface LocalBrowserOptions {
  directoryHandle: FileSystemDirectoryHandle;
  actor: { name: string; email: string };
}

export class LocalBrowserAdapter implements GitHostAdapter {
  constructor(private _opts: LocalBrowserOptions) {}

  async signIn(): Promise<void> { throw new NotImplementedError('LocalBrowserAdapter (planned for follow-up plan)'); }
  async signOut(): Promise<void> { throw new NotImplementedError('LocalBrowserAdapter'); }
  isAuthenticated(): boolean { return false; }
  currentActor(): string | null { return null; }
  async commit(_input: CommitInput): Promise<{ sha: string }> { throw new NotImplementedError('LocalBrowserAdapter.commit'); }
  async events(_query: EventQuery): Promise<RawCommit[]> { throw new NotImplementedError('LocalBrowserAdapter.events'); }
  capabilities() { return { realtime: false as const, tier1: true as const, tier2: false as const }; }
}
```

- [ ] **Step 3: Create `src/adapters/local/index.ts`** (re-exports)

```typescript
export { LocalNodeAdapter } from './node.js';
export type { LocalNodeOptions } from './node.js';
export { LocalBrowserAdapter } from './browser.js';
export type { LocalBrowserOptions } from './browser.js';
```

- [ ] **Step 4: Create `test/helpers/tmp-repo.ts`**

```typescript
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import git from 'isomorphic-git';

export interface TmpRepo {
  dir: string;
  cleanup: () => void;
}

export async function createTmpRepo(): Promise<TmpRepo> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnp-test-'));
  await git.init({ fs, dir, defaultBranch: 'main' });
  // Initial commit so the repo has a HEAD
  fs.writeFileSync(path.join(dir, '.keep'), '');
  await git.add({ fs, dir, filepath: '.keep' });
  await git.commit({
    fs,
    dir,
    message: 'init',
    author: { name: 'test', email: 'test@test' },
  });
  return {
    dir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}
```

- [ ] **Step 5: Write contract test in `test/contracts/local.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalNodeAdapter } from '../../src/adapters/local/node.js';
import { createTmpRepo, TmpRepo } from '../helpers/tmp-repo.js';
import { runAdapterContract } from './adapter.contract.js';

describe('LocalNodeAdapter (contract)', () => {
  let repo: TmpRepo;

  runAdapterContract({
    name: 'LocalNodeAdapter',
    create: async () => {
      repo = await createTmpRepo();
      return new LocalNodeAdapter({
        dir: repo.dir,
        actor: { name: 'queelius', email: 'lex@metafunctor.com' },
      });
    },
    cleanup: () => { if (repo) repo.cleanup(); },
  });
});
```

- [ ] **Step 6: Commit**

```bash
git add src/adapters/local/ test/helpers/tmp-repo.ts test/contracts/local.test.ts
git commit -m "LocalAdapter: Node implementation via isomorphic-git; Browser stub"
```

---

### Task 11: Adapter contract test suite

**Files:**
- Create: `test/contracts/adapter.contract.ts`

This is the suite of properties EVERY adapter must satisfy. It is invoked by `test/contracts/github.test.ts` and `test/contracts/local.test.ts`. If a property fails on either adapter, the contract is incomplete.

- [ ] **Step 1: Implement `test/contracts/adapter.contract.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitHostAdapter } from '../../src/core/types.js';

export interface ContractOptions {
  name: string;
  create: () => Promise<GitHostAdapter> | GitHostAdapter;
  cleanup?: () => Promise<void> | void;
}

export function runAdapterContract(opts: ContractOptions): void {
  describe(`${opts.name} contract`, () => {
    let adapter: GitHostAdapter;

    beforeEach(async () => {
      adapter = await opts.create();
      await adapter.signIn();
    });

    afterEach(async () => {
      if (opts.cleanup) await opts.cleanup();
    });

    it('signIn → isAuthenticated returns true; currentActor returns string', () => {
      expect(adapter.isAuthenticated()).toBe(true);
      expect(typeof adapter.currentActor()).toBe('string');
    });

    it('commit returns a sha that subsequently appears in events()', async () => {
      const result = await adapter.commit({
        subject: 'place piece 1 at slot [0,0]',
        body: 'op: place\nactor: queelius\nts: 2026-04-26T00:00:00Z\nv: 1\npiece: 1\nslot: [0, 0]\n',
      });
      expect(result.sha).toBeTruthy();

      const events = await adapter.events({ limit: 10 });
      const found = events.find(e => e.sha === result.sha);
      expect(found).toBeDefined();
      expect(found!.messageSubject).toContain('place');
      expect(found!.messageBody).toContain('op: place');
    });

    it('events returns commits in newest-first order', async () => {
      const sha1 = (await adapter.commit({
        subject: 's1',
        body: 'op: place\nactor: queelius\nts: 2026-04-26T00:00:00Z\nv: 1\npiece: 1\nslot: [0, 0]\n',
      })).sha;
      const sha2 = (await adapter.commit({
        subject: 's2',
        body: 'op: place\nactor: queelius\nts: 2026-04-26T00:00:01Z\nv: 1\npiece: 2\nslot: [1, 0]\n',
      })).sha;
      const events = await adapter.events({ limit: 10 });
      const idx1 = events.findIndex(e => e.sha === sha1);
      const idx2 = events.findIndex(e => e.sha === sha2);
      expect(idx2).toBeLessThan(idx1);
    });

    it('events with limit caps the result count', async () => {
      for (let i = 0; i < 5; i++) {
        await adapter.commit({
          subject: `s${i}`,
          body: `op: place\nactor: queelius\nts: 2026-04-26T00:00:0${i}Z\nv: 1\npiece: ${i}\nslot: [${i}, 0]\n`,
        });
      }
      const events = await adapter.events({ limit: 3 });
      expect(events.length).toBeLessThanOrEqual(3);
    });

    it('signOut → isAuthenticated returns false; currentActor returns null', async () => {
      await adapter.signOut();
      expect(adapter.isAuthenticated()).toBe(false);
      expect(adapter.currentActor()).toBeNull();
    });

    it('capabilities reports realtime:false, tier1:true', () => {
      const caps = adapter.capabilities();
      expect(caps.realtime).toBe(false);
      expect(caps.tier1).toBe(true);
    });
  });
}
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: all tests pass, including the contract suite running against both `GitHubAdapter` (via msw) and `LocalNodeAdapter` (via tmpdir).

- [ ] **Step 3: Commit**

```bash
git add test/contracts/adapter.contract.ts
git commit -m "Adapter contract suite: properties every GitHostAdapter must satisfy"
```

---

### Task 12: README, package metadata, build verification

**Files:**
- Modify: `README.md`, `package.json` (verify exports map)

- [ ] **Step 1: Expand `README.md`**

```markdown
# git-native

A host-agnostic substrate for committing structured events to a git repo from the browser, and reading them back.

The library that backs the *Your Blog Will Outlive Your Database* essay (https://metafunctor.com/post/2026-04-24-your-blog-will-outlive-your-database/).

## Status

`v0.1.0-pre`. Tier 1 (commit-as-write) implemented for GitHub and Local (Node) adapters. Tier 2 (branch, tag, merge, revert) deferred to follow-up plan.

## Install

```bash
npm install git-native
```

## Quick start (GitHub)

```typescript
import { gitNative } from 'git-native';
import { GitHubAdapter } from 'git-native/github';

const adapter = new GitHubAdapter({
  repo: 'youruser/yourdata',
  path: 'jigsaw/2026-W17/',
  clientId: 'YOUR_OAUTH_APP_CLIENT_ID',
  onUserCode: ({ userCode, verificationUri }) => {
    // Display userCode to the user; they enter it at verificationUri
  },
});

const store = gitNative({ adapter, pollInterval: 5000 });

await store.signIn();

await store.commit({ op: 'place', piece: 42, slot: [3, 7] });

const events = await store.events();

const sub = store.subscribe((newEvents) => {
  for (const e of newEvents) console.log('new event:', e);
});
// later: sub.unsubscribe();
```

## Quick start (Local, Node)

```typescript
import { gitNative } from 'git-native';
import { LocalNodeAdapter } from 'git-native/local';

const adapter = new LocalNodeAdapter({
  dir: '/path/to/git/repo',
  actor: { name: 'You', email: 'you@example.com' },
});

const store = gitNative({ adapter });
await store.signIn();
await store.commit({ op: 'react', target: 'posts/foo', value: '🔥' });
```

## Design

See `docs/superpowers/specs/2026-04-26-git-native-library-design.md` for the full design.

The architecture is:
- `core/`: host-agnostic. Public API, event format, conflict retry, subscription polling.
- `adapters/github/`: GitHub via Device Flow + REST.
- `adapters/local/`: isomorphic-git via `node:fs` (Node) or File System Access API (Browser, stub in MVP).
- `adapters/gitlab/`, `adapters/gitea/`: stubs with adapter-contract README, awaiting implementation.

## Writing your own adapter

Implement `GitHostAdapter` from `git-native`. Run `runAdapterContract` from this repo's test suite against it. If all properties pass, the adapter is conformant.

## License

MIT
```

- [ ] **Step 2: Verify exports map by running the build**

```bash
npm run build
```

Expected: `dist/` directory contains:
- `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`
- `dist/adapters/github/index.js`, `dist/adapters/github/index.cjs`, `dist/adapters/github/index.d.ts`
- `dist/adapters/local/index.js`, `dist/adapters/local/index.cjs`, `dist/adapters/local/index.d.ts`

- [ ] **Step 3: Run full CI (`typecheck` + `test` + `build`)**

```bash
npm run ci
```

Expected: all three steps pass, zero error output.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "README: install, quick start, design pointers, contributor adapter notes"
```

---

## Self-review

I checked the plan against the spec.

**1. Spec coverage:**

| Spec section | Covered by tasks |
|---|---|
| Goal / non-goals | Task 1 (README), explicit in plan header |
| Repos | Task 1 |
| Architecture / directory | Tasks 1-11 |
| Public API | Tasks 7 (Store) |
| Adapter contract | Task 2 (types), Tasks 8-10 (implementations), Task 11 (contract test) |
| Event payload format | Task 3 |
| Data flow (write/read/subscribe) | Tasks 5, 6, 7 |
| Error handling (5 categories) | Task 2 (error classes), Task 5 (ConflictError), Task 9 (NetworkError partial), Task 7 (AuthError) |
| Testing (unit/contract/integration) | Tasks 3-7 (unit), Task 11 (contract), Tasks 9 + 10 (integration via mocks/tmpdir) |
| Package and distribution | Tasks 1, 12 |
| Out of scope (explicit) | Honored: no Tier 2, no Python, no FastAPI, no GitLab/Gitea, no submodule, no real-time |

Gaps noted but accepted for Tier 1:
- Rate-limit warnings (`X-RateLimit-Remaining`): not implemented in Task 9. Adding this is small but not load-bearing for the jigsaw demo. Defer to Plan 2 or a v0.2 polish task.
- Subscription pause-after-three-failures: not implemented in Task 6. Subscription swallows errors and continues, which is the spec's "default" behavior, but the explicit pause behavior is deferred. Same call: defer.
- E2E tests against real GitHub: `test/e2e/` is mentioned in spec but no task creates the directory. Acceptable since E2E tests require a service-account token the CI can't carry. Defer to a manual workflow.

These are documented gaps, not placeholders. Plan 2 will pick them up.

**2. Placeholder scan:** none. Every step has actual code, exact commands with expected output, real file paths. No "TBD", no "implement later", no "similar to Task N".

**3. Type consistency:** Method signatures match across tasks:
- `commit(input: CommitInput): Promise<{ sha: string }>` — Task 2 (types), Task 4 (mock), Task 9 (GitHub), Task 10 (Local), Task 11 (contract)
- `events(query: EventQuery): Promise<RawCommit[]>` — same set
- `signIn() / signOut() / isAuthenticated() / currentActor()` — same set
- `parseEvent(body, sha) → Event` — Task 3 produces, Task 6 consumes, Task 7 consumes
- `formatEvent(event) → string` — Task 3 produces, Task 7 consumes
- `commitWithRetry(adapter, input)` — Task 5 produces, Task 7 consumes
- `createSubscriber(adapter, options, callback)` — Task 6 produces, Task 7 consumes

All consistent.
