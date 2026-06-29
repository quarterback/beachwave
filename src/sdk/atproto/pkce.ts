// PKCE (RFC 7636) code verifier/challenge generation.

import { randomToken, sha256Base64Url } from './encoding.js';

export interface Pkce {
  verifier: string;
  challenge: string;
  method: 'S256';
}

export async function generatePkce(): Promise<Pkce> {
  const verifier = randomToken(32);
  const challenge = await sha256Base64Url(verifier);
  return { verifier, challenge, method: 'S256' };
}
