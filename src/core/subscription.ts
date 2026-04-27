import { GitHostAdapter, Event, Subscription } from './types.js';
import { parseEvent } from './event.js';

export interface SubscribeOptions {
  pollInterval: number;        // milliseconds
}

export function createSubscriber(
  adapter: Pick<GitHostAdapter, 'events'>,
  options: SubscribeOptions,
  callback: (events: Event[]) => void,
): Subscription {
  let lastSeenAt: string | undefined = undefined;
  const seenShas = new Set<string>();
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const raw = await adapter.events(lastSeenAt ? { since: lastSeenAt } : {});
      if (raw.length === 0 || stopped) return;

      const fresh: Event[] = [];
      for (const c of raw) {
        if (seenShas.has(c.sha)) continue;
        try {
          fresh.push(parseEvent(c.messageBody, c.sha));
          seenShas.add(c.sha);
        } catch {
          // Mark unparseable commits as seen so we don't re-attempt them every tick.
          seenShas.add(c.sha);
        }
      }

      if (fresh.length > 0 && !stopped) {
        // Advance the time cursor to the newest event we just saw.
        // raw[0] is newest (adapter contract: newest-first).
        lastSeenAt = raw[0]!.committedAt;
        callback(fresh);
      }
    } catch {
      // Swallow poll errors in MVP; continue polling.
    }
  };

  const handle = setInterval(tick, options.pollInterval);

  return {
    unsubscribe(): void {
      stopped = true;
      clearInterval(handle);
    },
  };
}
