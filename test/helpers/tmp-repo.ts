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
