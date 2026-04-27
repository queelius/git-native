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
