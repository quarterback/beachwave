import type { OAuthClientConfig } from '../sdk/index.js';

// Scopes requested at sign-in. `atproto` is the required base scope and
// `transition:generic` grants the repository write access the room lifecycle
// needs. When granular scopes ship, only this string changes.
const SCOPE = 'atproto transition:generic';

const LOOPBACK_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/**
 * Derive the OAuth client configuration from the current origin.
 *
 * In production the `client_id` is the public URL of `client-metadata.json`,
 * which must be served at the deployed origin. On localhost we use ATProto's
 * special development client, where the configuration is encoded directly into
 * the `client_id`, so no hosted metadata document is required.
 */
export function resolveOAuthConfig(): OAuthClientConfig {
  const { origin, hostname } = window.location;
  const redirectUri = `${origin}/`;

  if (LOOPBACK_HOSTS.test(hostname)) {
    const clientId = `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(SCOPE)}`;
    return { clientId, redirectUri, scope: SCOPE };
  }

  return {
    clientId: `${origin}/client-metadata.json`,
    redirectUri,
    scope: SCOPE
  };
}

/**
 * Optional LiveKit token endpoint. Deployers that run a token service set it via
 * `<meta name="beachwave:livekit-token-endpoint" content="https://...">`. When
 * absent, the client shows the media handoff target instead of connecting.
 */
export function resolveMediaTokenEndpoint(): string | undefined {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="beachwave:livekit-token-endpoint"]');
  const value = meta?.content?.trim();
  return value || undefined;
}
