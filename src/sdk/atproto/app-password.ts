// App-password authentication — an OPTIONAL development fallback only.
//
// Modern ATProto clients should authenticate with OAuth (see oauth-client.ts).
// This path exists so the reference client can be exercised locally before an
// OAuth client metadata document is hosted. It uses legacy JWT sessions with a
// Bearer token rather than DPoP.

import type { AtprotoAgent } from './agent.js';
import { readJson } from './agent.js';
import { resolveIdentity } from './identity.js';

interface SessionResponse {
  did: string;
  handle?: string;
  accessJwt: string;
  refreshJwt: string;
}

const DEFAULT_RESOLVER = 'https://bsky.social';

export class AppPasswordSession implements AtprotoAgent {
  private constructor(
    public readonly did: string,
    public readonly handle: string | undefined,
    public readonly pds: string,
    private accessJwt: string,
    private refreshJwt: string
  ) {}

  /**
   * Sign in with a handle/DID and an app password. Resolves the account's PDS
   * first so it works for any host, not just bsky.social.
   */
  static async login(identifier: string, password: string, resolverBase = DEFAULT_RESOLVER): Promise<AppPasswordSession> {
    const identity = await resolveIdentity(identifier, resolverBase);
    const res = await fetch(`${identity.pds}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ identifier: identity.did, password })
    });
    const data = await readJson<SessionResponse>(res);
    return new AppPasswordSession(data.did, data.handle ?? identity.handle, identity.pds, data.accessJwt, data.refreshJwt);
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const url = path.startsWith('http') ? path : `${this.pds}${path.startsWith('/') ? '' : '/'}${path}`;
    const send = (jwt: string) => {
      const headers = new Headers(init.headers);
      headers.set('authorization', `Bearer ${jwt}`);
      return fetch(url, { ...init, headers });
    };

    let response = await send(this.accessJwt);
    if (response.status === 401 && (await this.refresh())) {
      response = await send(this.accessJwt);
    }
    return response;
  }

  async signOut(): Promise<void> {
    // App-password sessions are not persisted; nothing to revoke client-side.
  }

  private async refresh(): Promise<boolean> {
    const res = await fetch(`${this.pds}/xrpc/com.atproto.server.refreshSession`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.refreshJwt}`, accept: 'application/json' }
    });
    if (!res.ok) return false;
    const data = (await res.json()) as SessionResponse;
    this.accessJwt = data.accessJwt;
    this.refreshJwt = data.refreshJwt;
    return true;
  }
}
