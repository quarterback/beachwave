// Verify that an API caller is who they claim, using an ATProto service-auth
// JWT (com.atproto.server.getServiceAuth). The browser mints a short-lived JWT
// signed by the user's repo key; we verify the signature against that DID's
// published signing key. This is the same mechanism feed generators use.
//
// Enforcement is opt-in via BEACHWAVE_VERIFY_AUTH=1 so existing deployments keep
// working until a deployer turns it on (see api/* endpoints).

import { verifyJwt } from '@atproto/xrpc-server';
import { DidResolver } from '@atproto/identity';

/** Lexicon-method binding for the service-auth token (must match the client). */
export const LXM = 'community.beachwave.moderate';

/** True when endpoints should require and verify caller identity. */
export const REQUIRE_AUTH = process.env.BEACHWAVE_VERIFY_AUTH === '1';

const didResolver = new DidResolver({});

/**
 * Verify the caller's service-auth JWT (from the Authorization: Bearer header).
 * Returns { did } for a valid token, or null otherwise.
 */
export async function verifyCaller(req) {
  const header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return null;
  try {
    const did = await verifyJwt(match[1], null, LXM, (d) => didResolver.resolveAtprotoKey(d));
    return { did };
  } catch {
    return null;
  }
}

/** Whether a DID may administer a room: the repo owner or a listed host. */
export function isHost(did, room) {
  if (!did || !room) return false;
  if (did === room.authority) return true;
  const hosts = Array.isArray(room.value && room.value.hosts) ? room.value.hosts : [];
  return hosts.includes(did);
}
