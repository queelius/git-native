import { GitHostAdapter, CommitInput, EventQuery, RawCommit, AuthError, NotImplementedError } from '../../core/types.js';
import { deviceFlow } from './device-flow.js';
import { ApiClient } from './api.js';

export interface GitHubAdapterOptions {
  repo: string;                // 'owner/repo'
  path?: string;               // optional path scope
  clientId: string;            // OAuth App client_id
  scope?: string;
  onUserCode?: (info: { userCode: string; verificationUri: string }) => void;
  storage?: { get(): string | null; set(v: string | null): void };  // token persistence
}

export class GitHubAdapter implements GitHostAdapter {
  private token: string | null = null;
  private actor: string | null = null;
  private api: ApiClient | null = null;

  constructor(private opts: GitHubAdapterOptions) {
    if (opts.storage) {
      this.token = opts.storage.get();
      if (this.token) this.api = new ApiClient({ token: this.token, repo: opts.repo });
    }
  }

  async signIn(): Promise<void> {
    if (this.token) return;
    this.token = await deviceFlow({
      clientId: this.opts.clientId,
      scope: this.opts.scope,
      onUserCode: this.opts.onUserCode,
    });
    this.opts.storage?.set(this.token);
    this.api = new ApiClient({ token: this.token, repo: this.opts.repo });
    const viewer = await this.api.getViewer();
    this.actor = viewer.login;
  }

  async signOut(): Promise<void> {
    this.token = null;
    this.actor = null;
    this.api = null;
    this.opts.storage?.set(null);
  }

  isAuthenticated(): boolean {
    return this.token !== null;
  }

  currentActor(): string | null {
    return this.actor;
  }

  async commit(_input: CommitInput): Promise<{ sha: string }> {
    if (!this.api) throw new AuthError('Not authenticated');
    throw new NotImplementedError('GitHubAdapter.commit (implemented in Task 9)');
  }

  async events(_query: EventQuery): Promise<RawCommit[]> {
    if (!this.api) throw new AuthError('Not authenticated');
    throw new NotImplementedError('GitHubAdapter.events (implemented in Task 9)');
  }

  capabilities() {
    return { realtime: false as const, tier1: true as const, tier2: false as const };
  }
}
