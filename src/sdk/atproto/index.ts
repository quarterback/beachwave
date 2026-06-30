// Public surface of the ATProto integration layer.

export { type AtprotoAgent, readJson, createServiceAuth } from './agent.js';
export { OAuthClient, type OAuthClientConfig } from './oauth-client.js';
export { OAuthSession } from './oauth-session.js';
export { AppPasswordSession } from './app-password.js';
export { AtprotoRepositoryClient } from './repository.js';
export {
  type ResolvedIdentity,
  isDid,
  normalizeHandle,
  resolveHandle,
  resolveDidDocument,
  resolveIdentity,
  resolvePds,
  pdsFromDidDocument,
  handleFromDidDocument
} from './identity.js';
export { parseAtUri, formatAtUri, type AtUriParts } from './uri.js';
export { generatePkce, type Pkce } from './pkce.js';
export { generateDpopKey, createDpopProof, dpopKeyThumbprint, type DpopKey } from './dpop.js';
export { ecPublicThumbprint, type EcPublicJwk } from './jwk.js';
export { BrowserOAuthStore, type OAuthStore, type StoredSession, type PendingAuthorization } from './store.js';
export {
  discoverAuthServer,
  fetchAuthServerMetadata,
  fetchProtectedResourceMetadata,
  type AuthServerMetadata
} from './metadata.js';
export {
  base64UrlEncode,
  base64UrlDecode,
  sha256,
  sha256Base64Url,
  randomToken,
  utf8ToBytes,
  bytesToUtf8
} from './encoding.js';
