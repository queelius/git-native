import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { GitHubAdapter } from '../../src/adapters/github/index.js';
import { runAdapterContract } from './adapter.contract.js';

const inMemoryStorage = (): { get(): string | null; set(v: string | null): void } => {
  let value: string | null = null;
  return { get: () => value, set: (v) => { value = v; } };
};

let commits: Array<{ sha: string; message: string; author: string; date: string }> = [];
let files: Map<string, { sha: string; content: string }> = new Map();
let nextSha = 1;
let nextFileSha = 1;

const handlers = [
  http.get('https://api.github.com/user', () => HttpResponse.json({ login: 'test-user' })),
  http.get('https://api.github.com/repos/:owner/:repo/contents/*', ({ params }) => {
    const filePath = (params[0] as string) ?? '';
    const entry = files.get(filePath);
    if (!entry) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ sha: entry.sha, content: entry.content, path: filePath });
  }),
  http.put('https://api.github.com/repos/:owner/:repo/contents/*', async ({ request, params }) => {
    const body = await request.json() as { message: string; content: string; sha?: string };
    const filePath = (params[0] as string) ?? '';
    const sha = `gh-sha-${nextSha++}`;
    const fileSha = `file-sha-${nextFileSha++}`;
    files.set(filePath, { sha: fileSha, content: body.content });
    commits.unshift({ sha, message: body.message, author: 'test-user', date: new Date().toISOString() });
    return HttpResponse.json({ commit: { sha } }, { status: 201 });
  }),
  http.delete('https://api.github.com/repos/:owner/:repo/contents/*', async ({ request, params }) => {
    const body = await request.json() as { message: string; sha: string };
    const filePath = (params[0] as string) ?? '';
    files.delete(filePath);
    const sha = `gh-sha-${nextSha++}`;
    commits.unshift({ sha, message: body.message, author: 'test-user', date: new Date().toISOString() });
    return HttpResponse.json({ commit: { sha } });
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
beforeEach(() => { commits = []; files = new Map(); nextSha = 1; nextFileSha = 1; });

const createGitHubAdapter = () => {
  const storage = inMemoryStorage();
  storage.set('preauth-test-token');
  return new GitHubAdapter({
    repo: 'queelius/metafunctor-data',
    path: 'jigsaw/2026-W17/',
    clientId: 'test-client-id',
    storage,
  });
};

describe('GitHubAdapter (contract)', () => {
  runAdapterContract({
    name: 'GitHubAdapter',
    create: createGitHubAdapter,
  });

  it('delete removes a file and creates a commit (if adapter supports delete)', async () => {
    const adapter = createGitHubAdapter();
    await adapter.signIn();
    await adapter.commit({
      subject: 'create',
      body: 'op: place\nv: 1\n',
      files: { 'test/path.txt': 'hello' },
    });
    if (!adapter.delete) return;
    const { sha } = await adapter.delete({ files: ['test/path.txt'] });
    expect(sha).toBeTruthy();
  });
});
