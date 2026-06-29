// JSON Web Key helpers limited to the EC P-256 keys ATProto OAuth uses.

import { sha256Base64Url } from './encoding.js';

export interface EcPublicJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

/**
 * RFC 7638 JWK thumbprint for an EC public key. The canonical form uses the
 * required members in lexicographic order with no whitespace: crv, kty, x, y.
 */
export function ecPublicThumbprint(jwk: EcPublicJwk): Promise<string> {
  const canonical = `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}","y":"${jwk.y}"}`;
  return sha256Base64Url(canonical);
}
