// An authenticated OAuth session: DPoP-bound requests plus token refresh.

import type { AtprotoAgent } from './agent.js';
import { readJson } from './agent.js';
import type { DpopKey } from './dpop.js';
import type { OAuthStore, StoredSession } from './store.js';
import { fetchWithDpop, toHeaderRecord } from './transport.js';

interface TokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  sub?: string;
}

/** Refresh slightly ahead of expiry to avoid racing the clock. */
const REFRESH_SKEW_MS = 30_000;

export class OAuthSession implements AtprotoAgent {
  constructor(
    private session: StoredSession,
    private readonly key: DpopKey,
    private readonly clientId: string,
    private readonly store: OAuthStore
  ) {}

  get did(): string {
    return this.session.did;
  }

  get handle(): string | undefined {
    return this.session.handle;
  }

  get pds(): string {
    return this.session.pds;
  }

  get scope(): string {
    return this.session.scope;
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    await this.ensureFreshToken();

    const url = path.startsWith('http') ? path : `${this.session.pds}${path.startsWith('/') ? '' : '/'}${path}`;
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = toHeaderRecord(init.headers);
    const body = (init.body ?? undefined) as BodyInit | undefined;

    const result = await this.sendBound(method, url, headers, body);
    if (result.response.status !== 401) return result.response;

    // Access token may have been rejected; refresh once and retry.
    if (await this.refresh()) {
      return (await this.sendBound(method, url, headers, body)).response;
    }
    return result.response;
  }

  async signOut(): Promise<void> {
    await this.store.deleteSession();
  }

  private async sendBound(method: string, url: string, headers: Record<string, string>, body?: BodyInit) {
    const result = await fetchWithDpop(this.key, {
      method,
      url,
      headers,
      body,
      accessToken: this.session.accessToken,
      nonce: this.session.dpopNonce
    });
    if (result.nonce && result.nonce !== this.session.dpopNonce) {
      this.session.dpopNonce = result.nonce;
      await this.persist();
    }
    return result;
  }

  private async ensureFreshToken(): Promise<void> {
    if (Date.now() >= this.session.expiresAt - REFRESH_SKEW_MS) {
      await this.refresh();
    }
  }

  private async refresh(): Promise<boolean> {
    if (!this.session.refreshToken) return false;
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.session.refreshToken,
      client_id: this.clientId
    });
    const { response, nonce } = await fetchWithDpop(this.key, {
      method: 'POST',
      url: this.session.tokenEndpoint,
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: params.toString(),
      nonce: this.session.dpopNonce
    });
    if (!response.ok) return false;

    const token = await readJson<TokenResponse>(response);
    this.session = {
      ...this.session,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? this.session.refreshToken,
      scope: token.scope ?? this.session.scope,
      expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
      dpopNonce: nonce ?? this.session.dpopNonce
    };
    await this.persist();
    return true;
  }

  private async persist(): Promise<void> {
    await this.store.putSession(this.session, this.key);
  }
}
