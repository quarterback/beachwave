// ATProto OAuth client for browsers.
//
// Implements the public-client authorization-code flow ATProto requires:
// identity resolution, authorization-server discovery, PKCE, DPoP, and a
// Pushed Authorization Request (PAR), then the redirect and token exchange.
//
// The client is scope-agnostic: pass whatever space-delimited scopes the
// authorization server supports. It defaults to `atproto transition:generic`
// today and will accept granular scopes unchanged once they ship.

import { readJson } from './agent.js';
import { generateDpopKey } from './dpop.js';
import { resolveIdentity } from './identity.js';
import { discoverAuthServer } from './metadata.js';
import { OAuthSession } from './oauth-session.js';
import { generatePkce } from './pkce.js';
import { randomToken } from './encoding.js';
import { BrowserOAuthStore, type OAuthStore, type StoredSession } from './store.js';
import { fetchWithDpop } from './transport.js';

export interface OAuthClientConfig {
  /** Client identifier: the public URL of the client metadata document, or a loopback client_id for development. */
  clientId: string;
  /** Registered redirect URI the authorization server returns the user to. */
  redirectUri: string;
  /** Space-delimited scopes. Defaults to `atproto transition:generic`. */
  scope?: string;
  /** Host used to resolve handles to DIDs. Defaults to `https://bsky.social`. */
  handleResolver?: string;
  /** Persistence backend. Defaults to localStorage + IndexedDB. */
  store?: OAuthStore;
  /** Redirect implementation (overridable for testing). Defaults to `window.location.assign`. */
  redirect?: (url: string) => void;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  sub?: string;
}

const DEFAULT_SCOPE = 'atproto transition:generic';
const DEFAULT_RESOLVER = 'https://bsky.social';
const FORM_HEADERS = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };

export class OAuthClient {
  private readonly clientId: string;
  private readonly redirectUri: string;
  private readonly scope: string;
  private readonly handleResolver: string;
  private readonly store: OAuthStore;
  private readonly redirect: (url: string) => void;

  constructor(config: OAuthClientConfig) {
    this.clientId = config.clientId;
    this.redirectUri = config.redirectUri;
    this.scope = config.scope ?? DEFAULT_SCOPE;
    this.handleResolver = config.handleResolver ?? DEFAULT_RESOLVER;
    this.store = config.store ?? new BrowserOAuthStore();
    this.redirect = config.redirect ?? ((url) => window.location.assign(url));
  }

  /** True when the given query parameters look like an OAuth redirect callback. */
  static isCallback(params: URLSearchParams): boolean {
    return params.has('state') && (params.has('code') || params.has('error'));
  }

  /**
   * Begin sign-in for a handle or DID. Resolves identity, performs a PAR, then
   * navigates to the authorization server. Does not return on success.
   */
  async authorize(identifier: string): Promise<never> {
    const identity = await resolveIdentity(identifier, this.handleResolver);
    const meta = await discoverAuthServer(identity.pds);
    const pkce = await generatePkce();
    const dpopKey = await generateDpopKey();
    const state = randomToken();

    const parBody = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: this.scope,
      state,
      code_challenge: pkce.challenge,
      code_challenge_method: pkce.method,
      login_hint: identity.handle ?? identity.did
    });

    const { response, nonce } = await fetchWithDpop(dpopKey, {
      method: 'POST',
      url: meta.pushed_authorization_request_endpoint,
      headers: FORM_HEADERS,
      body: parBody.toString()
    });
    const par = await readJson<{ request_uri: string }>(response);

    await this.store.putPending(
      {
        state,
        did: identity.did,
        handle: identity.handle,
        pds: identity.pds,
        issuer: meta.issuer,
        authorizationEndpoint: meta.authorization_endpoint,
        tokenEndpoint: meta.token_endpoint,
        codeVerifier: pkce.verifier,
        scope: this.scope,
        dpopNonce: nonce,
        createdAt: Date.now()
      },
      dpopKey
    );

    const authUrl = new URL(meta.authorization_endpoint);
    authUrl.searchParams.set('client_id', this.clientId);
    authUrl.searchParams.set('request_uri', par.request_uri);
    this.redirect(authUrl.toString());

    // Block until the navigation takes effect so callers can `await` safely.
    return new Promise<never>(() => {});
  }

  /** Complete sign-in from the redirect callback's query parameters. */
  async callback(params: URLSearchParams): Promise<OAuthSession> {
    if (params.has('error')) {
      throw new Error(`Authorization failed: ${params.get('error_description') ?? params.get('error')}`);
    }
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) throw new Error('Authorization response is missing code or state');

    const found = await this.store.getPending(state);
    if (!found) throw new Error('No matching pending authorization for this state');
    const { pending, key } = found;

    const iss = params.get('iss');
    if (iss && iss !== pending.issuer) throw new Error('Issuer mismatch in authorization response');

    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      code_verifier: pending.codeVerifier
    });

    const { response, nonce } = await fetchWithDpop(key, {
      method: 'POST',
      url: pending.tokenEndpoint,
      headers: FORM_HEADERS,
      body: tokenBody.toString(),
      nonce: pending.dpopNonce
    });
    const token = await readJson<TokenResponse>(response);

    const session: StoredSession = {
      did: token.sub ?? pending.did,
      handle: pending.handle,
      pds: pending.pds,
      issuer: pending.issuer,
      tokenEndpoint: pending.tokenEndpoint,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      scope: token.scope ?? pending.scope,
      expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
      dpopNonce: nonce ?? pending.dpopNonce
    };

    await this.store.putSession(session, key);
    await this.store.deletePending(state);
    return new OAuthSession(session, key, this.clientId, this.store);
  }

  /** Restore a previously persisted session, if one exists. */
  async restore(): Promise<OAuthSession | undefined> {
    const found = await this.store.getSession();
    if (!found) return undefined;
    return new OAuthSession(found.session, found.key, this.clientId, this.store);
  }
}
