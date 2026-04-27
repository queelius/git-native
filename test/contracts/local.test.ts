import { describe } from 'vitest';
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
