// Vercel serverless function: remove (kick) a participant from a LiveKit room.
//
// Disconnecting a participant is a privileged server action (it needs the API
// secret), so a host's "Remove" button calls this. LiveKit drops the named
// participant; their client sees a Disconnected event.
//
// Required Vercel environment variables (same as api/token.js):
//   LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL
//
// SECURITY NOTE: like the other media functions, this trusts the caller. Before
// a public launch, verify the caller is actually a host of the room.

import { RoomServiceClient } from 'livekit-server-sdk';

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

  const host = url.replace(/^ws/, 'http');
  const svc = new RoomServiceClient(host, apiKey, apiSecret);
  try {
    await svc.removeParticipant(livekitRoom, identity);
  } catch (error) {
    res.status(502).json({ error: `Could not remove participant: ${error?.message ?? error}` });
    return;
  }

  res.status(200).json({ ok: true });
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
