const GITHUB_API = 'https://api.github.com';

export interface ApiClientOptions {
  token: string | null;        // null permits anonymous reads on public repos
  repo: string;                // 'owner/repo'
}

export interface PutContentsInput {
  path: string;
  content: string;             // raw text; encoded base64 inside
  message: string;             // commit message (subject + body)
  branch?: string;
  sha?: string;                // existing file sha, required when updating
}

export interface CommitListItem {
  sha: string;
  commit: {
    author: { name: string; email: string; date: string };
    message: string;
  };
  author: { login: string } | null;
}

export class ApiClient {
  constructor(private opts: ApiClientOptions) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };
    if (this.opts.token) {
      h['Authorization'] = `Bearer ${this.opts.token}`;
    }
    return h;
  }

  async getViewer(): Promise<{ login: string }> {
    const resp = await fetch(`${GITHUB_API}/user`, { headers: this.headers() });
    if (!resp.ok) {
      const err = new Error(`Viewer lookup failed: ${resp.status}`);
      (err as { status?: number }).status = resp.status;
      throw err;
    }
    return resp.json();
  }

  async putContents(input: PutContentsInput): Promise<{ commit: { sha: string } }> {
    const resp = await fetch(
      `${GITHUB_API}/repos/${this.opts.repo}/contents/${encodeURIComponent(input.path).replace(/%2F/g, '/')}`,
      {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify({
          message: input.message,
          content: btoa(unescape(encodeURIComponent(input.content))),
          branch: input.branch,
          sha: input.sha,
        }),
      }
    );
    if (resp.status === 409 || resp.status === 422) {
      const text = await resp.text();
      throw Object.assign(new Error(`Contents conflict: ${text}`), { isConflict: true });
    }
    if (!resp.ok) {
      const text = await resp.text();
      const err = new Error(`Put contents failed: ${resp.status} ${text}`);
      (err as { status?: number }).status = resp.status;
      throw err;
    }
    return resp.json();
  }

  async listCommits(opts: { path?: string; since?: string; per_page?: number }): Promise<CommitListItem[]> {
    const params = new URLSearchParams();
    if (opts.path) params.set('path', opts.path);
    if (opts.since) params.set('since', opts.since);
    params.set('per_page', String(opts.per_page ?? 50));
    const resp = await fetch(
      `${GITHUB_API}/repos/${this.opts.repo}/commits?${params}`,
      { headers: this.headers() }
    );
    if (!resp.ok) {
      const err = new Error(`List commits failed: ${resp.status}`);
      (err as { status?: number }).status = resp.status;
      throw err;
    }
    return resp.json();
  }
}
