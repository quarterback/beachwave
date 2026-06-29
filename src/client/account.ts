// Bridges the three sign-in modes into one shape the UI can render uniformly.
//
//   * oauth        — the real, recommended ATProto flow (persists across reloads)
//   * app-password — optional development fallback (session is in-memory only)
//   * offline      — local-storage demo with no network, for UI work
//
// Each mode produces a RepositoryClient the SDK room functions consume without
// knowing which mode created it.

import {
  AppPasswordSession,
  AtprotoRepositoryClient,
  OAuthClient,
  OAuthSession,
  type RepositoryClient
} from '../sdk/index.js';
import { BrowserRepositoryClient } from './browser-repository.js';

export type AccountKind = 'oauth' | 'app-password' | 'offline';

export interface Account {
  kind: AccountKind;
  did: string;
  /** Display label: handle when known, otherwise the DID. */
  label: string;
  pds?: string;
  client: RepositoryClient;
  signOut(): Promise<void>;
}

export async function restoreAccount(oauth: OAuthClient): Promise<Account | undefined> {
  const session = await oauth.restore();
  if (!session) return undefined;
  return oauthAccount(session);
}

export async function completeOAuthCallback(oauth: OAuthClient, params: URLSearchParams): Promise<Account> {
  return oauthAccount(await oauth.callback(params));
}

export function startOAuthSignIn(oauth: OAuthClient, identifier: string): Promise<never> {
  return oauth.authorize(identifier);
}

export async function signInWithAppPassword(identifier: string, password: string): Promise<Account> {
  const session = await AppPasswordSession.login(identifier, password);
  return {
    kind: 'app-password',
    did: session.did,
    label: session.handle ?? session.did,
    pds: session.pds,
    client: new AtprotoRepositoryClient(session),
    signOut: () => session.signOut()
  };
}

export function startOfflineDemo(): Account {
  const did = 'did:example:offline-demo';
  const client = new BrowserRepositoryClient(did);
  return {
    kind: 'offline',
    did,
    label: 'Offline demo',
    client,
    signOut: async () => client.clear()
  };
}

function oauthAccount(session: OAuthSession): Account {
  return {
    kind: 'oauth',
    did: session.did,
    label: session.handle ?? session.did,
    pds: session.pds,
    client: new AtprotoRepositoryClient(session),
    signOut: () => session.signOut()
  };
}
