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
// SECURITY NOTE: this endpoint currently trusts the caller's identity and role.
// Anyone who can POST here can obtain a token for any room. That is acceptable
// for early dogfooding but should be hardened before a public launch by
// verifying the caller's ATProto session (e.g. require the OAuth access token
// and confirm `identity` matches the authenticated DID) and deriving `role`
// server-side from the room's host list rather than trusting the client.

import { AccessToken } from 'livekit-server-sdk';

export default async function handler(req, res) {
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
  const identity = typeof body.identity === 'string' ? body.identity : '';
  if (!livekitRoom || !identity) {
    res.status(400).json({ error: 'livekitRoom and identity are required' });
    return;
  }

  const canPublish = body.role === 'host' || body.role === 'speaker';
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
