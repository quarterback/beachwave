// DPoP (RFC 9449) support: proof-of-possession keys and proof JWTs.
//
// ATProto OAuth requires every token request and authenticated XRPC call to be
// bound to a sender-held key. We generate a P-256 (ES256) key pair, keep the
// private key non-extractable, and sign short-lived proof JWTs with it.

import { base64UrlEncode, jsonToBase64Url, nowSeconds, randomToken, sha256, utf8ToBytes } from './encoding.js';
import { ecPublicThumbprint, type EcPublicJwk } from './jwk.js';

export interface DpopKey {
  /** Non-extractable signing key used to mint proofs. */
  readonly privateKey: CryptoKey;
  /** Public JWK embedded in every proof header. */
  readonly publicJwk: EcPublicJwk;
}

const ALGORITHM: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_PARAMS: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };

/**
 * Generate a fresh DPoP key. The key pair is created extractable so we can read
 * the public coordinates, then the private key is re-imported as non-extractable
 * before anything is persisted, so a stored session can never leak the key.
 */
export async function generateDpopKey(): Promise<DpopKey> {
  const pair = await crypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  const privateJwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  const privateKey = await crypto.subtle.importKey('jwk', privateJwk, ALGORITHM, false, ['sign']);
  return {
    privateKey,
    publicJwk: { kty: 'EC', crv: 'P-256', x: jwk.x as string, y: jwk.y as string }
  };
}

export interface DpopProofInput {
  /** HTTP method of the request the proof authorizes. */
  htm: string;
  /** Target URL of the request (without query string or fragment per RFC 9449). */
  htu: string;
  /** Server-issued nonce, when one has been observed. */
  nonce?: string;
  /** Access token to bind via the `ath` claim, for resource requests. */
  accessToken?: string;
}

/** Create a signed DPoP proof JWT for a single request. */
export async function createDpopProof(key: DpopKey, input: DpopProofInput): Promise<string> {
  const header = { typ: 'dpop+jwt', alg: 'ES256', jwk: key.publicJwk };
  const payload: Record<string, unknown> = {
    jti: randomToken(16),
    htm: input.htm.toUpperCase(),
    htu: stripUrl(input.htu),
    iat: nowSeconds()
  };
  if (input.nonce) payload.nonce = input.nonce;
  if (input.accessToken) payload.ath = base64UrlEncode(await sha256(input.accessToken));

  const signingInput = `${jsonToBase64Url(header)}.${jsonToBase64Url(payload)}`;
  const signature = await crypto.subtle.sign(SIGN_PARAMS, key.privateKey, utf8ToBytes(signingInput) as BufferSource);
  // WebCrypto ECDSA already returns the raw r||s concatenation JWS/ES256 expects.
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** RFC 9449 thumbprint of the bound key (used as `cnf.jkt`, exposed for tests). */
export function dpopKeyThumbprint(key: DpopKey): Promise<string> {
  return ecPublicThumbprint(key.publicJwk);
}

function stripUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}
