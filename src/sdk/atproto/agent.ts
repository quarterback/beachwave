// The minimal authenticated surface the rest of the SDK depends on.
//
// Both the OAuth session and the development app-password session implement
// this interface, so the repository adapter and reference client never need to
// know which authentication method produced the session.

export interface AtprotoAgent {
  /** DID of the authenticated account. */
  readonly did: string;
  /** Primary handle, when known. */
  readonly handle?: string;
  /** PDS base URL the account's repository lives on (no trailing slash). */
  readonly pds: string;
  /**
   * Perform an authenticated request against the account's PDS. `path` may be a
   * PDS-relative path (e.g. `/xrpc/com.atproto.repo.createRecord`) or an
   * absolute URL on the same PDS.
   */
  fetch(path: string, init?: RequestInit): Promise<Response>;
  /** Revoke/clear the session. */
  signOut(): Promise<void>;
}

/** Read a JSON response body, throwing a useful error on non-2xx replies. */
export async function readJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const detail =
      body && typeof body === 'object'
        ? ((body as { error?: string; message?: string }).message ??
          (body as { error?: string }).error ??
          JSON.stringify(body))
        : String(body ?? '');
    throw new Error(`Request failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  return body as T;
}
