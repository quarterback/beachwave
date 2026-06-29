// DPoP-aware fetch helper with automatic nonce handling (RFC 9449 §8).
//
// Authorization servers and resource servers can demand a server-issued nonce
// by rejecting the first request with `use_dpop_nonce` and returning the nonce
// in a `DPoP-Nonce` header. This helper transparently retries once with that
// nonce so callers never have to.

import { createDpopProof, type DpopKey } from './dpop.js';

export interface DpopRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  /** Access token to send as `Authorization: DPoP <token>` and bind via `ath`. */
  accessToken?: string;
  /** Last known server nonce, if any. */
  nonce?: string;
}

export interface DpopResult {
  response: Response;
  /** Most recent server nonce observed (persist this for the next request). */
  nonce?: string;
}

export async function fetchWithDpop(key: DpopKey, request: DpopRequest): Promise<DpopResult> {
  let nonce = request.nonce;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const proof = await createDpopProof(key, {
      htm: request.method,
      htu: request.url,
      nonce,
      accessToken: request.accessToken
    });
    const headers: Record<string, string> = { ...(request.headers ?? {}), DPoP: proof };
    if (request.accessToken) headers.authorization = `DPoP ${request.accessToken}`;

    const response = await fetch(request.url, {
      method: request.method,
      headers,
      body: request.body ?? undefined
    });

    const serverNonce = response.headers.get('DPoP-Nonce');
    if (serverNonce) nonce = serverNonce;

    if (response.ok || attempt === 1) return { response, nonce };
    if (serverNonce && (await requiresNonce(response))) continue;
    return { response, nonce };
  }

  // Unreachable: the loop always returns within two attempts.
  throw new Error('DPoP request exhausted retries');
}

async function requiresNonce(response: Response): Promise<boolean> {
  if (response.status !== 400 && response.status !== 401) return false;
  const wwwAuth = response.headers.get('WWW-Authenticate') ?? '';
  if (wwwAuth.includes('use_dpop_nonce')) return true;
  try {
    const body = (await response.clone().json()) as { error?: string };
    return body?.error === 'use_dpop_nonce';
  } catch {
    return false;
  }
}

export function toHeaderRecord(init?: HeadersInit): Record<string, string> {
  const record: Record<string, string> = {};
  if (!init) return record;
  new Headers(init).forEach((value, key) => {
    record[key] = value;
  });
  return record;
}
