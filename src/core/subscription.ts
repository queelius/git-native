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
  let lastSeenSha: string | undefined = undefined;
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const raw = await adapter.events({ since: lastSeenSha });
      if (raw.length > 0 && !stopped) {
        const events: Event[] = [];
        for (const c of raw) {
          try {
            events.push(parseEvent(c.messageBody, c.sha));
          } catch {
            // Skip events that fail to parse; subscriber sees only valid events.
          }
        }
        if (events.length > 0) {
          lastSeenSha = raw[0]!.sha;
          callback(events);
        }
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
