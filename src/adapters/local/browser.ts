import { GitHostAdapter, CommitInput, EventQuery, RawCommit, NotImplementedError } from '../../core/types.js';

export interface LocalBrowserOptions {
  directoryHandle: FileSystemDirectoryHandle;
  actor: { name: string; email: string };
}

export class LocalBrowserAdapter implements GitHostAdapter {
  constructor(private _opts: LocalBrowserOptions) {}

  async signIn(): Promise<void> { throw new NotImplementedError('LocalBrowserAdapter (planned for follow-up plan)'); }
  async signOut(): Promise<void> { throw new NotImplementedError('LocalBrowserAdapter'); }
  isAuthenticated(): boolean { return false; }
  currentActor(): string | null { return null; }
  async commit(_input: CommitInput): Promise<{ sha: string }> { throw new NotImplementedError('LocalBrowserAdapter.commit'); }
  async events(_query: EventQuery): Promise<RawCommit[]> { throw new NotImplementedError('LocalBrowserAdapter.events'); }
  capabilities() { return { realtime: false as const, tier1: true as const, tier2: false as const }; }
}
