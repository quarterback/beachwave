// Vercel serverless function: mint LiveKit access tokens for Beachwave.
//
// LiveKit tokens must be signed with the API secret, which can never live in the
// browser. This endpoint runs server-side, reads the credentials from
// environment variables, and returns a short-lived token plus the LiveKit URL.
//
// Required Vercel environment variables (Project Settings -> Environment
// Variables — NOT GitHub secrets):
//   LIVEKIT_API_KEY     LiveKit project API key
//   LIVEKIT_API_SECRET  LiveKit project API secret
//   LIVEKIT_URL         wss://<project>.livekit.cloud
//
// The browser client posts { livekitRoom, identity, displayName, role } and
// expects { url, token } back (see src/sdk/media/).
//
// Identity verification is opt-in via BEACHWAVE_VERIFY_AUTH=1. When enabled, the
// caller must present a valid ATProto service-auth JWT; the token is then bound
// to the verified DID and publish permission is derived from the room record
// (hosts always, others only in open-mic rooms), so a client cannot impersonate
// another account or grant itself the mic. When disabled (default), the endpoint
// trusts the caller, which is acceptable for early dogfooding.

import { AccessToken } from 'livekit-server-sdk';
import { resolveRoomRecord } from '../lib/room.js';
import { isHost, verifyCaller, REQUIRE_AUTH } from '../lib/auth.js';

export default async function handler(req, res) {
  // Allow cross-origin calls so a room is joinable from another Beachwave
  // deployment (the room record advertises this endpoint as its serviceEndpoint).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) {
    res.status(503).json({ error: 'LiveKit is not configured on the server' });
    return;
  }

  const body = parseBody(req.body);
  const livekitRoom = typeof body.livekitRoom === 'string' ? body.livekitRoom : '';
  let identity = typeof body.identity === 'string' ? body.identity : '';
  let canPublish = body.role === 'host' || body.role === 'speaker';

  if (REQUIRE_AUTH) {
    const caller = await verifyCaller(req);
    if (!caller) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    identity = caller.did; // bind the token to the verified caller
    const room = await resolveRoomRecord(body.roomUri);
    if (!room || room.value.livekitRoom !== livekitRoom) {
      res.status(403).json({ error: 'Room does not match the authenticated request' });
      return;
    }
    // Server decides who may speak: hosts always, others only in open-mic rooms.
    canPublish = isHost(caller.did, room) || room.value.openMic === true;
  }

  if (!livekitRoom || !identity) {
    res.status(400).json({ error: 'livekitRoom and identity are required' });
    return;
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: typeof body.displayName === 'string' ? body.displayName : undefined,
    ttl: '1h'
  });
  token.addGrant({
    roomJoin: true,
    room: livekitRoom,
    canPublish,
    canSubscribe: true,
    canPublishData: true
  });

  res.status(200).json({ url, token: await token.toJwt() });
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}
