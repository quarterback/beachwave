// Vercel serverless function: grant (or revoke) a participant's publish
// permission in a LiveKit room.
//
// A LiveKit participant's publish permission is fixed in the token it joined
// with; changing it after the fact requires a server-side call with the API
// secret. This endpoint is how a host promotes a listener to speaker once they
// approve a "request to speak". LiveKit pushes the updated permission to that
// participant, whose client can then enable the microphone.
//
// Required Vercel environment variables (same as api/token.js):
//   LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL
//
// SECURITY NOTE: like api/token.js, this endpoint currently trusts the caller.
// Before a public launch, verify that the caller is actually a host of the room
// (e.g. confirm their ATProto session and check the room record's host list)
// rather than allowing anyone who can POST here to promote anyone.

import { RoomServiceClient } from 'livekit-server-sdk';

export default async function handler(req, res) {
  // Cross-origin allowed so a co-host on another deployment can moderate.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
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
  const identity = typeof body.identity === 'string' ? body.identity : '';
  if (!livekitRoom || !identity) {
    res.status(400).json({ error: 'livekitRoom and identity are required' });
    return;
  }
  const canPublish = body.canPublish !== false; // default to granting

  // RoomServiceClient speaks the HTTPS management API, not the wss media URL.
  const host = url.replace(/^ws/, 'http');
  const svc = new RoomServiceClient(host, apiKey, apiSecret);
  try {
    await svc.updateParticipant(livekitRoom, identity, undefined, {
      canPublish,
      canSubscribe: true,
      canPublishData: true
    });
  } catch (error) {
    res.status(502).json({ error: `Could not update participant: ${error?.message ?? error}` });
    return;
  }

  res.status(200).json({ ok: true, canPublish });
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
