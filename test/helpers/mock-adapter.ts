import { GitHostAdapter, CommitInput, EventQuery, RawCommit } from '../../src/core/types.js';

export class MockAdapter implements GitHostAdapter {
  private actor: string | null = null;
  private commits: RawCommit[] = [];
  private nextSha = 1;

  constructor(opts: { actor?: string } = {}) {
    if (opts.actor) this.actor = opts.actor;
  }

  async signIn(): Promise<void> {
    this.actor = this.actor ?? 'mock-user';
  }

  async signInWithToken(_token: string): Promise<void> {
    this.actor = this.actor ?? 'mock-user';
  }

  async signOut(): Promise<void> {
    this.actor = null;
  }

  isAuthenticated(): boolean {
    return this.actor !== null;
  }

  currentActor(): string | null {
    return this.actor;
  }

  async commit(input: CommitInput): Promise<{ sha: string }> {
    if (!this.isAuthenticated()) {
      throw new Error('not authenticated');
    }
    const sha = `sha-${this.nextSha++}`;
    this.commits.unshift({
      sha,
      author: this.actor!,
      committedAt: new Date().toISOString(),
      messageSubject: input.subject,
      messageBody: input.body,
    });
    return { sha };
  }

  async events(query: EventQuery): Promise<RawCommit[]> {
    let result = this.commits.slice();
    if (query.since) {
      if (/^\d{4}-/.test(query.since)) {
        // ISO date filter: return commits strictly newer than the cutoff.
        result = result.filter(c => c.committedAt > query.since!);
      } else {
        // Legacy sha filter: kept so any existing sha-based callers still work.
        const idx = result.findIndex(c => c.sha === query.since);
        if (idx >= 0) result = result.slice(0, idx);
      }
    }
    if (query.limit) result = result.slice(0, query.limit);
    return result;
  }

  // Test helpers (not part of GitHostAdapter)
  _injectCommit(commit: RawCommit): void {
    this.commits.unshift(commit);
  }

  _reset(): void {
    this.commits = [];
    this.nextSha = 1;
  }
}
