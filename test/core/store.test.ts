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
