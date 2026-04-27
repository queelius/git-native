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
