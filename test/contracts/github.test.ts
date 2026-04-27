import { describe, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { GitHubAdapter } from '../../src/adapters/github/index.js';
import { runAdapterContract } from './adapter.contract.js';

const inMemoryStorage = (): { get(): string | null; set(v: string | null): void } => {
  let value: string | null = null;
  return { get: () => value, set: (v) => { value = v; } };
};

let commits: Array<{ sha: string; message: string; author: string; date: string }> = [];
let nextSha = 1;

const handlers = [
  http.get('https://api.github.com/user', () => HttpResponse.json({ login: 'test-user' })),
  http.put('https://api.github.com/repos/:owner/:repo/contents/*', async ({ request }) => {
    const body = await request.json() as { message: string };
    const sha = `gh-sha-${nextSha++}`;
    commits.unshift({ sha, message: body.message, author: 'test-user', date: new Date().toISOString() });
    return HttpResponse.json({ commit: { sha } }, { status: 201 });
  }),
  http.get('https://api.github.com/repos/:owner/:repo/commits', ({ request }) => {
    const url = new URL(request.url);
    const perPage = Number(url.searchParams.get('per_page') ?? '50');
    const page = commits.slice(0, perPage);
    return HttpResponse.json(page.map(c => ({
      sha: c.sha,
      commit: { author: { name: c.author, email: 'x@x', date: c.date }, message: c.message },
      author: { login: c.author },
    })));
  }),
];

const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => { commits = []; nextSha = 1; });

describe('GitHubAdapter (contract)', () => {
  runAdapterContract({
    name: 'GitHubAdapter',
    create: () => {
      const storage = inMemoryStorage();
      storage.set('preauth-test-token');
      return new GitHubAdapter({
        repo: 'queelius/metafunctor-data',
        path: 'jigsaw/2026-W17/',
        clientId: 'test-client-id',
        storage,
      });
    },
  });
});
