import { GitHostAdapter, CommitInput, EventQuery, RawCommit } from '../../core/types.js';

export interface LocalBrowserOptions {
  directoryHandle: FileSystemDirectoryHandle;
  actor: { name: string; email: string };
}

export class LocalBrowserAdapter implements GitHostAdapter {
  constructor(private _opts: LocalBrowserOptions) {}

  async signIn(): Promise<void> { throw new Error('LocalBrowserAdapter is not implemented'); }
  async signOut(): Promise<void> { throw new Error('LocalBrowserAdapter is not implemented'); }
  isAuthenticated(): boolean { return false; }
  currentActor(): string | null { return null; }
  async commit(_input: CommitInput): Promise<{ sha: string }> { throw new Error('LocalBrowserAdapter is not implemented'); }
  async events(_query: EventQuery): Promise<RawCommit[]> { throw new Error('LocalBrowserAdapter is not implemented'); }
}
