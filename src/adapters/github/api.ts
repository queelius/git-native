const GITHUB_API = 'https://api.github.com';

export interface ApiClientOptions {
  token: string;
  repo: string;                // 'owner/repo'
}

export class ApiClient {
  constructor(private opts: ApiClientOptions) {}

  async getViewer(): Promise<{ login: string }> {
    const resp = await fetch(`${GITHUB_API}/user`, {
      headers: {
        'Authorization': `Bearer ${this.opts.token}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    if (!resp.ok) throw new Error(`Viewer lookup failed: ${resp.status}`);
    return resp.json();
  }
}
