// Structured event payload (the typed contents of a commit message body).
export interface Event {
  op: string;                  // verb, e.g. 'place', 'react', 'comment'
  actor: string;               // who, e.g. GitHub username
  ts: string;                  // ISO 8601 timestamp
  v: 1;                        // protocol version
  sha: string;                 // commit hash this event was parsed from
  [key: string]: unknown;      // op-specific fields (piece, slot, target, value, etc.)
}

// What a consumer passes to commit(); the library fills actor, ts, v, sha.
export type EventInput = Omit<Event, 'actor' | 'ts' | 'v' | 'sha'>;

export interface EventQuery {
  since?: string;              // ISO date or commit sha
  limit?: number;              // default 50
  path?: string;               // restrict to commits touching this path
}

// Adapter-level commit input. The core builds this from EventInput.
export interface CommitInput {
  subject: string;             // human-readable summary
  body: string;                // YAML-formatted event payload
  files?: Record<string, string>;  // path -> contents, atomic with the commit
  branch?: string;             // target branch; defaults to repo default branch
}

// Normalized shape returned by adapter.events(). Core parses messageBody as YAML.
export interface RawCommit {
  sha: string;
  author: string;              // who committed
  committedAt: string;         // ISO 8601
  messageSubject: string;
  messageBody: string;
}

export interface GitHostAdapter {
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  isAuthenticated(): boolean;
  currentActor(): string | null;

  commit(input: CommitInput): Promise<{ sha: string }>;
  events(query: EventQuery): Promise<RawCommit[]>;

}

export interface CommitOptions {
  branch?: string;
  files?: Record<string, string>;
}

export interface Subscription {
  unsubscribe(): void;
}

// Errors

export class ConflictError extends Error {
  constructor(message = 'Commit conflicted with remote state') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class AuthError extends Error {
  constructor(message = 'Authentication required or failed') {
    super(message);
    this.name = 'AuthError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

