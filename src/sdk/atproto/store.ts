// Persistence for OAuth flows.
//
// Two stores are used:
//   * localStorage holds JSON state (pending authorizations and the session).
//   * IndexedDB holds the non-extractable DPoP CryptoKey, which cannot be
//     serialized to JSON but survives the redirect round-trip via structured
//     clone.

import type { DpopKey } from './dpop.js';

export interface PendingAuthorization {
  state: string;
  did: string;
  handle?: string;
  pds: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  codeVerifier: string;
  scope: string;
  dpopNonce?: string;
  createdAt: number;
}

export interface StoredSession {
  did: string;
  handle?: string;
  pds: string;
  issuer: string;
  tokenEndpoint: string;
  accessToken: string;
  refreshToken?: string;
  scope: string;
  /** Absolute expiry of the access token, in epoch milliseconds. */
  expiresAt: number;
  dpopNonce?: string;
}

export interface OAuthStore {
  putPending(pending: PendingAuthorization, key: DpopKey): Promise<void>;
  getPending(state: string): Promise<{ pending: PendingAuthorization; key: DpopKey } | undefined>;
  deletePending(state: string): Promise<void>;
  putSession(session: StoredSession, key: DpopKey): Promise<void>;
  getSession(): Promise<{ session: StoredSession; key: DpopKey } | undefined>;
  deleteSession(): Promise<void>;
}

const PENDING_PREFIX = 'beachwave.oauth.pending.';
const SESSION_KEY = 'beachwave.oauth.session';
const SESSION_KEY_ID = 'session';

/** Default store backed by localStorage + IndexedDB. */
export class BrowserOAuthStore implements OAuthStore {
  async putPending(pending: PendingAuthorization, key: DpopKey): Promise<void> {
    localStorage.setItem(PENDING_PREFIX + pending.state, JSON.stringify(pending));
    await idbPut(pending.state, key);
  }

  async getPending(state: string): Promise<{ pending: PendingAuthorization; key: DpopKey } | undefined> {
    const raw = localStorage.getItem(PENDING_PREFIX + state);
    if (!raw) return undefined;
    const key = await idbGet(state);
    if (!key) return undefined;
    return { pending: JSON.parse(raw) as PendingAuthorization, key };
  }

  async deletePending(state: string): Promise<void> {
    localStorage.removeItem(PENDING_PREFIX + state);
    await idbDelete(state);
  }

  async putSession(session: StoredSession, key: DpopKey): Promise<void> {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    await idbPut(SESSION_KEY_ID, key);
  }

  async getSession(): Promise<{ session: StoredSession; key: DpopKey } | undefined> {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return undefined;
    const key = await idbGet(SESSION_KEY_ID);
    if (!key) return undefined;
    return { session: JSON.parse(raw) as StoredSession, key };
  }

  async deleteSession(): Promise<void> {
    localStorage.removeItem(SESSION_KEY);
    await idbDelete(SESSION_KEY_ID);
  }
}

const DB_NAME = 'beachwave-oauth';
const KEY_STORE = 'dpop-keys';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(KEY_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open OAuth key store'));
  });
}

async function idbPut(id: string, key: DpopKey): Promise<void> {
  const db = await openDb();
  try {
    await runRequest(db, 'readwrite', (store) => store.put(key, id));
  } finally {
    db.close();
  }
}

async function idbGet(id: string): Promise<DpopKey | undefined> {
  const db = await openDb();
  try {
    return (await runRequest(db, 'readonly', (store) => store.get(id))) as DpopKey | undefined;
  } finally {
    db.close();
  }
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDb();
  try {
    await runRequest(db, 'readwrite', (store) => store.delete(id));
  } finally {
    db.close();
  }
}

function runRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, mode);
    const request = action(tx.objectStore(KEY_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('OAuth key store request failed'));
  });
}
