import { describe, it, expect, afterEach } from 'vitest';
import { LocalNodeAdapter } from '../../src/adapters/local/node.js';
import { createTmpRepo, TmpRepo } from '../helpers/tmp-repo.js';
import { runAdapterContract } from './adapter.contract.js';

let repo: TmpRepo;

describe('LocalNodeAdapter (contract)', () => {
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

describe('LocalNodeAdapter delete', () => {
  let localRepo: TmpRepo;

  afterEach(() => {
    if (localRepo) localRepo.cleanup();
  });

  it('delete removes a file and creates a commit (if adapter supports delete)', async () => {
    localRepo = await createTmpRepo();
    const adapter = new LocalNodeAdapter({
      dir: localRepo.dir,
      actor: { name: 'queelius', email: 'lex@metafunctor.com' },
    });
    await adapter.signIn();
    await adapter.commit({
      subject: 'create',
      body: 'op: place\nv: 1\n',
      files: { 'test/path.txt': 'hello' },
    });
    if (!adapter.delete) return;
    const { sha } = await adapter.delete({ files: ['test/path.txt'] });
    expect(sha).toBeTruthy();
  });
});
