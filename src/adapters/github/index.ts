import { GitHostAdapter, CommitInput, EventQuery, RawCommit, AuthError, ConflictError } from '../../core/types.js';
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
    if (!this.token) {
      this.token = await deviceFlow({
        clientId: this.opts.clientId,
        scope: this.opts.scope,
        onUserCode: this.opts.onUserCode,
      });
      this.opts.storage?.set(this.token);
      this.api = new ApiClient({ token: this.token, repo: this.opts.repo });
    }
    if (!this.api) {
      this.api = new ApiClient({ token: this.token, repo: this.opts.repo });
    }
    if (this.actor === null) {
      const viewer = await this.api.getViewer();
      this.actor = viewer.login;
    }
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

  async commit(input: CommitInput): Promise<{ sha: string }> {
    if (!this.api) throw new AuthError('Not authenticated');

    const fullMessage = input.subject + (input.body ? '\n\n' + input.body : '');
    const branch = input.branch;

    const filesEntries = Object.entries(input.files ?? {});
    if (filesEntries.length > 1) {
      throw new Error('Multi-file commits are not supported. Use single-file commits.');
    }

    let filePath: string;
    let content: string;
    if (filesEntries.length === 1) {
      [filePath, content] = filesEntries[0]!;
    } else {
      filePath = `${this.opts.path ?? ''}.gnp/events/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.event`;
      content = input.body;
    }

    try {
      const result = await this.api.putContents({ path: filePath, content, message: fullMessage, branch });
      return { sha: result.commit.sha };
    } catch (e) {
      if ((e as { isConflict?: boolean }).isConflict) {
        throw new ConflictError();
      }
      throw e;
    }
  }

  async events(query: EventQuery): Promise<RawCommit[]> {
    if (!this.api) throw new AuthError('Not authenticated');

    const since = query.since && /^\d{4}-/.test(query.since) ? query.since : undefined;
    const list = await this.api.listCommits({
      path: this.opts.path,
      since,
      per_page: query.limit ?? 50,
    });

    return list.map(c => {
      const lines = c.commit.message.split('\n');
      const subject = lines[0] ?? '';
      const body = lines.slice(2).join('\n');
      return {
        sha: c.sha,
        author: c.author?.login ?? c.commit.author.name,
        committedAt: c.commit.author.date,
        messageSubject: subject,
        messageBody: body,
      };
    });
  }

}
