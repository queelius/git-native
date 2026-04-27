---
date: 2026-04-26
author: Alexander Towell (queelius)
status: design, awaiting user review
type: library-design
---

# Spec: git-native library

The TypeScript library that backs the *Your Blog Will Outlive Your Database* essay. Host-agnostic core; one adapter per git host. First consumer is the jigsaw demo at `/arcade/jigsaw`.

## Goal

Commit structured events to a git repo from the browser, and read them back. The substrate is git, not GitHub. The library should work against any host that exposes git's transport.

## Non-goals (MVP)

- Python client. Deferred follow-up.
- FastAPI adapter. Deferred follow-up.
- Real-time / push-based updates. Polling only. The substrate is for participation, not for high-frequency state.
- Hosted-service primitives that aren't pure git operations (`fork` is the obvious one). The library is `git-native`, not GitHub-native.
- Submodule operations. No consumer needs them yet.

## Repos

- `git-native` (this repo): the library.
- `git-jigsaw`: the demo. Separate brainstorm and build cycle.
- Data target for the jigsaw: `metafunctor-data/jigsaw/` (one repo per blog, apps as subdirectories; per the persist follow-up doc).

## Architecture

A host-agnostic core sits behind one public API. Adapters do the host-specific work. Both adapters in MVP must satisfy the same contract; the second adapter validates that the contract is real and not GitHub-shaped by accident.

```
git-native/
├── src/
│   ├── core/
│   │   ├── store.ts             # public API
│   │   ├── subscription.ts      # polling, dedup, fan-out
│   │   ├── event.ts             # YAML payload format, parse + format
│   │   ├── conflict.ts          # retry-on-409 wrapper
│   │   └── types.ts             # GitHostAdapter, Event, EventQuery
│   ├── adapters/
│   │   ├── github/              # MVP: Device Flow + REST
│   │   ├── local/               # MVP: isomorphic-git on FSA (browser) or node:fs (tests)
│   │   ├── gitlab/              # stub + adapter contract README
│   │   └── gitea/               # stub + adapter contract README
│   └── index.ts
├── test/
│   ├── core/                    # mocked adapter
│   ├── contracts/               # runs against both real adapters
│   ├── integration/             # LocalAdapter on tmpdir
│   └── e2e/                     # GitHubAdapter, opt-in
├── package.json
└── README.md
```

Adapters are imported from subpaths: `import { gitHub } from 'git-native/github'`. Tree-shaking keeps `isomorphic-git` (~300KB) out of bundles that use only the GitHub adapter.

## Public API

```typescript
interface Store {
  // Auth (host-specific under the adapter, uniform up here)
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  isAuthenticated(): boolean;
  currentActor(): string | null;

  // Tier 1: commit-as-write. MVP fully implemented for both adapters.
  commit(event: EventInput, opts?: CommitOptions): Promise<{ sha: string }>;
  events(query?: EventQuery): Promise<Event[]>;
  subscribe(callback: (newEvents: Event[]) => void): Subscription;

  // Tier 2: branching, tagging, merging, reverting.
  // MVP: functional for simple cases on both adapters; complex cases (non-FF
  // merges, multi-commit revert chains) throw NotImplementedError.
  branches(): Promise<Branch[]>;
  branch(name: string, fromSha?: string): Promise<Branch>;
  tags(): Promise<Tag[]>;
  tag(name: string, sha?: string, message?: string): Promise<Tag>;
  merge(sourceBranch: string, options?: MergeOptions): Promise<{ sha: string }>;
  revert(sha: string, options?: RevertOptions): Promise<{ sha: string }>;
}
```

`branch` is a per-call option on `commit`, not a stateful working-tree concept on the Store:

```typescript
await store.commit(event, { branch: 'drafts' });
```

Construction:

```typescript
import { gitNative } from 'git-native';
import { GitHubAdapter } from 'git-native/github';

const store = gitNative({
  adapter: new GitHubAdapter({
    repo: 'queelius/metafunctor-data',
    path: 'jigsaw/2026-W17/',
  }),
  pollInterval: 5000,
});
```

Or via a convenience constructor that bundles the adapter import:

```typescript
import { gitHub } from 'git-native/github';

const store = gitHub({
  repo: 'queelius/metafunctor-data',
  path: 'jigsaw/2026-W17/',
});
```

## Adapter contract

```typescript
interface GitHostAdapter {
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  isAuthenticated(): boolean;
  currentActor(): string | null;

  commit(input: CommitInput): Promise<{ sha: string }>;
  events(query: EventQuery): Promise<RawCommit[]>;

  branches(): Promise<Branch[]>;
  branch(name: string, fromSha?: string): Promise<Branch>;
  tags(): Promise<Tag[]>;
  tag(name: string, sha?: string, message?: string): Promise<Tag>;
  merge(sourceBranch: string, options?: MergeOptions): Promise<{ sha: string }>;
  revert(sha: string, options?: RevertOptions): Promise<{ sha: string }>;

  capabilities(): { realtime: false; tier1: true; tier2: boolean };
}
```

`CommitInput` carries the formatted commit message subject and body, plus an optional `files` map for the case where the event also writes a file (jigsaw places piece 42 → event in commit body AND file at `pieces/042.json`, both atomic in one commit). Pure event commits (reactions, votes) omit `files`.

`RawCommit` is a normalized shape adapters return: `{ sha, author, committedAt, messageSubject, messageBody }`. The core parses `messageBody` as YAML to produce `Event`.

Adapters that don't support a Tier 2 operation throw `NotImplementedError`. The core never assumes Tier 2 capability; consumers handle the throw or check `capabilities()` first.

## Event payload format

YAML in the commit message body. The subject is auto-generated human-readable summary.

```
Subject: place piece 42 at slot [3,7]

Body:
op: place
piece: 42
slot: [3, 7]
actor: queelius
ts: 2026-04-26T14:23:11Z
v: 1
```

Every event carries `v: 1`. The library refuses to parse events with unknown major versions. Minor version changes are additive (new fields are allowed; old parsers ignore them).

## Data flow

**Write.** `store.commit(event)` fills `actor` from `adapter.currentActor()`, `ts` from now, `v: 1`. `core/conflict.ts` wraps `adapter.commit()`. On 409, refetch state and retry once. Persistent conflict throws.

**Read.** `store.events(query)` calls `adapter.events()`, gets `RawCommit[]`, parses each `messageBody` as YAML, returns typed `Event[]`. Validation happens here (unknown major version → `ValidationError`).

**Subscribe.** `store.subscribe(cb)` records the last-seen sha, polls `adapter.events({ since: lastSeenSha })` on `pollInterval`, dedups, fires the callback with new events. One polling loop per Store, fanned out to all subscribers. Subscribers get a `Subscription` with `unsubscribe()`.

## Error handling

Five categories, each with a defined behavior:

- `ConflictError`: 409 from `adapter.commit`. Core retries once with refetched state. Persistent conflict throws.
- `AuthError`: token expired, scope insufficient, sign-in canceled. Token cleared, throws.
- `NetworkError`: timeout, 5xx, offline. Exponential backoff, three attempts default, configurable.
- `ValidationError`: malformed event payload, unknown major version. Throws immediately, no retry.
- `NotImplementedError`: Tier 2 method called on an adapter that doesn't support it. Throws synchronously.

GitHub rate limit (5,000/hour authenticated) is tracked via `X-RateLimit-Remaining`. The library emits a `RateLimitWarning` event below 100 remaining. Exhaustion is a `NetworkError` with `retry-after` honored.

Subscription resilience: a single failed poll emits an `error` event, polling continues. Three consecutive failures pause polling and emit `paused`. Visibility-change or manual `resume()` restarts.

## Testing

Three layers, each with a deliberate adapter strategy.

**Unit (`test/core/`)** uses an in-memory `MockAdapter`. Tests core logic only. Fast, no I/O. Runs on every commit.

**Contract (`test/contracts/`)** is one suite of properties every `GitHostAdapter` must satisfy. Runs against `GitHubAdapter` (HTTP mocked via msw or equivalent) AND `LocalAdapter` (real `isomorphic-git` on a tmpdir repo). If a property fails on either, the contract is incomplete. This is the two-adapter validation discipline.

**Integration (`test/integration/`)** uses `LocalAdapter` on a tmpdir. Verifies real `isomorphic-git` behavior: branch, tag, merge, revert with actual git semantics.

**E2E (`test/e2e/`)** uses `GitHubAdapter` against a dedicated test repo with a service-account PAT. Opt-in only (requires `GITHUB_TEST_TOKEN`). Verifies real GitHub API behavior, rate limit handling, real response shapes.

Coverage targets: 90% on `core/`, 80% on adapters. Subscription gets explicit fake-timer tests.

## Package and distribution

- npm package: `git-native`. Check name availability before public push.
- License: MIT.
- TypeScript strict. `tsc --noEmit` runs separately from tests.
- Build via `tsup` or `esbuild` to dual ESM + CJS, with subpath exports for adapters.
- Versioning: semver. v0.x while the protocol is unstable; v1.0 once the structured-event format is committed to.

## Risks

- `isomorphic-git` bundle size (~300KB minified gzipped). Mitigated by subpath imports + tree-shaking. Consumers using only `GitHubAdapter` never load it.
- File System Access API is Chromium-only at the time of writing. `LocalAdapter` has Node and Browser flavors; tests run in Node, the browser flavor degrades to "not available" on Firefox/Safari.
- GitHub Device Flow is unfamiliar to non-technical readers. Acceptable for the technical-audience MVP. Documented in the README; OAuth-via-Worker is a future optimization for sites that want a smoother flow.
- Protocol versioning is naive (single integer). Acceptable for v1. Revisit before v2.
- Polling with a 5,000/hour rate limit caps active subscribers per token. For the jigsaw at 5s poll interval, that's 720 polls/hour per subscriber. Single-user is fine; multi-user needs token-per-user (already the case via per-user OAuth).

## Out of scope (explicit)

These belong to follow-up projects, not this MVP:

- Python client (`git-native-py`)
- FastAPI adapter
- GitLab and Gitea adapters (interface-only stubs in MVP)
- Submodule operations
- Real-time updates (long-poll, webhook, WebSocket)
- Multi-repo composition
- Identity providers beyond GitHub
- Right-to-be-forgotten tooling
- Hosted OAuth Worker (documented as optional future)
