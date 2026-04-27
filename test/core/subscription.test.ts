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
