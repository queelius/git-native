import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitHostAdapter } from '../../src/core/types.js';

export interface ContractOptions {
  name: string;
  create: () => Promise<GitHostAdapter> | GitHostAdapter;
  cleanup?: () => Promise<void> | void;
}

export function runAdapterContract(opts: ContractOptions): void {
  describe(`${opts.name} contract`, () => {
    let adapter: GitHostAdapter;

    beforeEach(async () => {
      adapter = await opts.create();
      await adapter.signIn();
    });

    afterEach(async () => {
      if (opts.cleanup) await opts.cleanup();
    });

    it('signIn -> isAuthenticated returns true; currentActor returns string', () => {
      expect(adapter.isAuthenticated()).toBe(true);
      expect(typeof adapter.currentActor()).toBe('string');
    });

    it('commit returns a sha that subsequently appears in events()', async () => {
      const result = await adapter.commit({
        subject: 'place piece 1 at slot [0,0]',
        body: 'op: place\nactor: queelius\nts: 2026-04-26T00:00:00Z\nv: 1\npiece: 1\nslot: [0, 0]\n',
      });
      expect(result.sha).toBeTruthy();

      const events = await adapter.events({ limit: 10 });
      const found = events.find(e => e.sha === result.sha);
      expect(found).toBeDefined();
      expect(found!.messageSubject).toContain('place');
      expect(found!.messageBody).toContain('op: place');
    });

    it('events returns commits in newest-first order', async () => {
      const sha1 = (await adapter.commit({
        subject: 's1',
        body: 'op: place\nactor: queelius\nts: 2026-04-26T00:00:00Z\nv: 1\npiece: 1\nslot: [0, 0]\n',
      })).sha;
      const sha2 = (await adapter.commit({
        subject: 's2',
        body: 'op: place\nactor: queelius\nts: 2026-04-26T00:00:01Z\nv: 1\npiece: 2\nslot: [1, 0]\n',
      })).sha;
      const events = await adapter.events({ limit: 10 });
      const idx1 = events.findIndex(e => e.sha === sha1);
      const idx2 = events.findIndex(e => e.sha === sha2);
      expect(idx2).toBeLessThan(idx1);
    });

    it('events with limit caps the result count', async () => {
      for (let i = 0; i < 5; i++) {
        await adapter.commit({
          subject: `s${i}`,
          body: `op: place\nactor: queelius\nts: 2026-04-26T00:00:0${i}Z\nv: 1\npiece: ${i}\nslot: [${i}, 0]\n`,
        });
      }
      const events = await adapter.events({ limit: 3 });
      expect(events.length).toBeLessThanOrEqual(3);
    });

    it('signOut -> isAuthenticated returns false; currentActor returns null', async () => {
      await adapter.signOut();
      expect(adapter.isAuthenticated()).toBe(false);
      expect(adapter.currentActor()).toBeNull();
    });

    it('capabilities reports realtime:false, tier1:true', () => {
      const caps = adapter.capabilities();
      expect(caps.realtime).toBe(false);
      expect(caps.tier1).toBe(true);
    });
  });
}
