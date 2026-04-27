# git-native

A host-agnostic substrate for committing structured events to a git repo from the browser, and reading them back.

The library that backs the *Your Blog Will Outlive Your Database* essay (https://metafunctor.com/post/2026-04-24-your-blog-will-outlive-your-database/).

## Status

`v0.1.0-pre`. Tier 1 (commit-as-write) implemented for GitHub and Local (Node) adapters. Tier 2 (branch, tag, merge, revert) deferred to a follow-up plan.

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
    console.log(`Code: ${userCode} at ${verificationUri}`);
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

The architecture is host-agnostic core plus adapters per git host:

- `core/`: public API, structured-event format, conflict retry, subscription polling.
- `adapters/github/`: GitHub via Device Flow + REST.
- `adapters/local/`: isomorphic-git via `node:fs` (Node) or File System Access API (Browser, stub in MVP).
- `adapters/gitlab/`, `adapters/gitea/`: stubs awaiting implementation.

## Writing your own adapter

Implement `GitHostAdapter` from `git-native`. Run `runAdapterContract` from this repo's test suite against it. If all properties pass, the adapter is conformant.

## License

MIT
