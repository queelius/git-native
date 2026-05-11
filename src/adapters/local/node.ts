import * as fs from 'node:fs';
import * as path from 'node:path';
import git from 'isomorphic-git';
import { GitHostAdapter, CommitInput, EventQuery, RawCommit, AuthError } from '../../core/types.js';

export interface LocalNodeOptions {
  dir: string;                 // path to a git working directory
  actor: { name: string; email: string };
}

export class LocalNodeAdapter implements GitHostAdapter {
  private signedIn = false;
  constructor(private opts: LocalNodeOptions) {}

  async signIn(): Promise<void> { this.signedIn = true; }
  async signOut(): Promise<void> { this.signedIn = false; }
  isAuthenticated(): boolean { return this.signedIn; }
  currentActor(): string | null { return this.signedIn ? this.opts.actor.name : null; }

  async commit(input: CommitInput): Promise<{ sha: string }> {
    if (!this.signedIn) throw new AuthError('Not authenticated');

    const filesEntries = Object.entries(input.files ?? {});
    if (filesEntries.length === 0) {
      const sentinelDir = path.join(this.opts.dir, '.gnp', 'events');
      fs.mkdirSync(sentinelDir, { recursive: true });
      const fname = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.event`;
      fs.writeFileSync(path.join(sentinelDir, fname), input.body);
      await git.add({ fs, dir: this.opts.dir, filepath: path.join('.gnp/events', fname) });
    } else {
      for (const [filepath, content] of filesEntries) {
        const fullPath = path.join(this.opts.dir, filepath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
        await git.add({ fs, dir: this.opts.dir, filepath });
      }
    }

    const fullMessage = input.subject + (input.body ? '\n\n' + input.body : '');
    const sha = await git.commit({
      fs,
      dir: this.opts.dir,
      message: fullMessage,
      author: this.opts.actor,
    });
    return { sha };
  }

  async delete(input: { files: string[]; branch?: string }): Promise<{ sha: string }> {
    if (!this.signedIn) throw new AuthError('Not authenticated');
    if (input.files.length !== 1) {
      throw new Error('Multi-file delete is not supported. Use single-file delete.');
    }
    const filepath = input.files[0]!;
    const fullPath = path.join(this.opts.dir, filepath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File does not exist: ${filepath}`);
    }
    fs.unlinkSync(fullPath);
    await git.remove({ fs, dir: this.opts.dir, filepath });
    const message = `delete ${filepath}`;
    const sha = await git.commit({
      fs,
      dir: this.opts.dir,
      message,
      author: this.opts.actor,
    });
    return { sha };
  }

  async events(query: EventQuery): Promise<RawCommit[]> {
    // isomorphic-git stops walking when committer.timestamp <= sinceTimestamp (seconds).
    // Subtract one second so commits at exactly the since boundary are included.
    let sinceDate: Date | undefined;
    if (query.since && /^\d{4}-/.test(query.since)) {
      sinceDate = new Date(new Date(query.since).getTime() - 1000);
    }
    const log = await git.log({
      fs,
      dir: this.opts.dir,
      depth: query.limit ?? 50,
      ...(sinceDate ? { since: sinceDate } : {}),
    });

    return log.map(entry => {
      const message = entry.commit.message;
      const lines = message.split('\n');
      const subject = lines[0] ?? '';
      const body = lines.slice(2).join('\n');
      return {
        sha: entry.oid,
        author: entry.commit.author.name,
        committedAt: new Date(entry.commit.author.timestamp * 1000).toISOString(),
        messageSubject: subject,
        messageBody: body,
      };
    });
  }

}
