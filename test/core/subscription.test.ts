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

  it('handles repeated polls without re-firing for the same commits', async () => {
    const adapter = new MockAdapter({ actor: 'alice' });
    await adapter.signIn();
    adapter._injectCommit({
      sha: 'sha-A',
      author: 'alice',
      committedAt: '2026-04-26T00:00:00Z',
      messageSubject: 'subject A',
      messageBody: 'op: place\nactor: alice\nts: 2026-04-26T00:00:00Z\nv: 1\npiece: 1\nslot: [0, 0]\n',
    });

    const cb = vi.fn();
    const sub = createSubscriber(adapter, { pollInterval: 1000 }, cb);

    await vi.advanceTimersByTimeAsync(1000);
    expect(cb).toHaveBeenCalledTimes(1);

    // Inject a NEW commit; expect callback to fire only with the new event.
    adapter._injectCommit({
      sha: 'sha-B',
      author: 'alice',
      committedAt: '2026-04-26T00:00:01Z',
      messageSubject: 'subject B',
      messageBody: 'op: place\nactor: alice\nts: 2026-04-26T00:00:01Z\nv: 1\npiece: 2\nslot: [1, 0]\n',
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(cb).toHaveBeenCalledTimes(2);
    const secondCall = cb.mock.calls[1]![0];
    expect(secondCall).toHaveLength(1);
    expect(secondCall[0].sha).toBe('sha-B');

    // Idle poll: no new commits, callback should NOT fire.
    await vi.advanceTimersByTimeAsync(1000);
    expect(cb).toHaveBeenCalledTimes(2);

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
