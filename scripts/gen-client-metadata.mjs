// Generate client-metadata.json for the deployed origin at build time.
//
// ATProto OAuth requires the client metadata document to be served at the
// `client_id` URL, and every URL inside it must match the origin it is served
// from. Hand-editing the domain is easy to forget (and causes
// `invalid_client_metadata`), so on a deploy we regenerate the file from the
// public URL.
//
// Resolution order for the public origin:
//   1. BEACHWAVE_PUBLIC_URL        — set this for a custom domain
//   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel's stable production domain
//
// With neither set (e.g. local `npm run build`), the committed file is left as
// is, so nothing breaks offline.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SCOPE = 'atproto transition:generic';

function resolveOrigin() {
  if (process.env.BEACHWAVE_PUBLIC_URL) {
    return process.env.BEACHWAVE_PUBLIC_URL.replace(/\/+$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/+$/, '')}`;
  }
  return undefined;
}

const origin = resolveOrigin();
if (!origin) {
  console.log('[client-metadata] No public URL env var set; leaving client-metadata.json unchanged.');
  process.exit(0);
}

const metadata = {
  client_id: `${origin}/client-metadata.json`,
  client_name: 'Beachwave',
  client_uri: origin,
  logo_uri: `${origin}/beachwave.svg`,
  redirect_uris: [`${origin}/`],
  scope: SCOPE,
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
  application_type: 'web',
  dpop_bound_access_tokens: true
};

const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'client-metadata.json');
writeFileSync(outPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`[client-metadata] Wrote client-metadata.json for ${origin}`);
