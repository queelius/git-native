const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';

export interface DeviceFlowOptions {
  clientId: string;            // public, registered OAuth App client_id
  scope?: string;              // default 'public_repo'
  onUserCode?: (info: { userCode: string; verificationUri: string }) => void;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  interval?: number;
}

export async function deviceFlow(opts: DeviceFlowOptions): Promise<string> {
  const codeResp = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: opts.clientId, scope: opts.scope ?? 'public_repo' }),
  });
  if (!codeResp.ok) throw new Error(`Device code request failed: ${codeResp.status}`);
  const code: DeviceCodeResponse = await codeResp.json();

  if (opts.onUserCode) {
    opts.onUserCode({ userCode: code.user_code, verificationUri: code.verification_uri });
  }

  let interval = code.interval * 1000;
  const deadline = Date.now() + code.expires_in * 1000;

  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, interval));
    const tokenResp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: opts.clientId,
        device_code: code.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    if (!tokenResp.ok) throw new Error(`Token poll failed: ${tokenResp.status}`);
    const data: TokenResponse = await tokenResp.json();
    if (data.access_token) return data.access_token;
    if (data.error === 'authorization_pending') continue;
    if (data.error === 'slow_down') {
      interval = (data.interval ?? code.interval + 5) * 1000;
      continue;
    }
    throw new Error(`Device flow failed: ${data.error ?? 'unknown'}`);
  }
  throw new Error('Device flow timed out');
}
