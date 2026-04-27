import {
  GitHostAdapter,
  Event,
  EventInput,
  EventQuery,
  CommitOptions,
  Subscription,
  AuthError,
} from './types.js';
import { formatEvent, parseEvent, generateSubject } from './event.js';
import { commitWithRetry } from './conflict.js';
import { createSubscriber } from './subscription.js';

export interface StoreOptions {
  adapter: GitHostAdapter;
  pollInterval?: number;       // default 5000
}

export interface Store {
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  isAuthenticated(): boolean;
  currentActor(): string | null;
  commit(event: EventInput, opts?: CommitOptions): Promise<{ sha: string }>;
  events(query?: EventQuery): Promise<Event[]>;
  subscribe(callback: (events: Event[]) => void): Subscription;
}

export function gitNative(options: StoreOptions): Store {
  const { adapter } = options;
  const pollInterval = options.pollInterval ?? 5000;

  return {
    signIn: () => adapter.signIn(),
    signOut: () => adapter.signOut(),
    isAuthenticated: () => adapter.isAuthenticated(),
    currentActor: () => adapter.currentActor(),

    async commit(event, opts) {
      const actor = adapter.currentActor();
      if (actor === null) throw new AuthError('Not authenticated');
      const fullEvent = {
        ...event,
        actor,
        ts: new Date().toISOString(),
        v: 1 as const,
        sha: '',
      } as Event;
      const body = formatEvent(fullEvent);
      const subject = generateSubject(fullEvent);
      return commitWithRetry(adapter, {
        subject,
        body,
        files: opts?.files,
        branch: opts?.branch,
      });
    },

    async events(query = {}) {
      const raw = await adapter.events(query);
      const result: Event[] = [];
      for (const c of raw) {
        try {
          result.push(parseEvent(c.messageBody, c.sha));
        } catch {
          // Skip unparseable commits; not all commits are git-native events.
        }
      }
      return result;
    },

    subscribe(callback) {
      return createSubscriber(adapter, { pollInterval }, callback);
    },
  };
}
