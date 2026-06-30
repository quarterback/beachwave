import test from 'node:test';
import assert from 'node:assert/strict';

import { encodeChat, decodeChat } from '../dist/sdk/media/chat.js';
import { buildRoomPost, POST_COLLECTION, announceRoom } from '../dist/sdk/announce.js';
import { MemoryRepositoryClient } from '../dist/sdk/memory-client.js';

test('chat payloads round-trip through the data channel format', () => {
  const bytes = encodeChat('hello 🌊 world', 1700000000000, 'alice.bsky.social');
  const decoded = decodeChat(bytes);
  assert.deepEqual(decoded, { text: 'hello 🌊 world', at: 1700000000000, name: 'alice.bsky.social' });
});

test('decodeChat rejects non-chat and malformed payloads', () => {
  assert.equal(decodeChat(new TextEncoder().encode('not json')), null);
  assert.equal(decodeChat(new TextEncoder().encode(JSON.stringify({ t: 'other', text: 'x' }))), null);
  assert.equal(decodeChat(new TextEncoder().encode(JSON.stringify({ t: 'chat' }))), null);
});

/** Decode the bytes a facet points at, to prove the offsets are correct. */
function facetedSpan(record) {
  const bytes = new TextEncoder().encode(record.text);
  const { byteStart, byteEnd } = record.facets[0].index;
  return new TextDecoder().decode(bytes.slice(byteStart, byteEnd));
}

test('buildRoomPost links the URL already present in the text', () => {
  const url = 'https://rooms.example/?room=at://did:plc:abc/community.beachwave.room/1';
  const record = buildRoomPost({ text: `Office Hours is live — join: ${url}`, url, createdAt: '2026-01-01T00:00:00.000Z' });

  assert.equal(record.$type, POST_COLLECTION);
  assert.equal(record.facets[0].features[0]['$type'], 'app.bsky.richtext.facet#link');
  assert.equal(record.facets[0].features[0].uri, url);
  assert.equal(facetedSpan(record), url);
  assert.equal(record.createdAt, '2026-01-01T00:00:00.000Z');
});

test('buildRoomPost appends the URL when absent and offsets survive unicode', () => {
  const url = 'https://rooms.example/r';
  const record = buildRoomPost({ text: 'café is open', url });
  assert.equal(record.text, `café is open ${url}`);
  assert.equal(facetedSpan(record), url);
});

test('buildRoomPost handles empty text', () => {
  const url = 'https://rooms.example/r';
  const record = buildRoomPost({ text: '', url });
  assert.equal(record.text, url);
  assert.equal(facetedSpan(record), url);
});

test('announceRoom writes an app.bsky.feed.post record', async () => {
  const client = new MemoryRepositoryClient('did:example:host');
  const { uri } = await announceRoom(client, { text: 'live now', url: 'https://rooms.example/r' });
  assert.match(uri, /app\.bsky\.feed\.post/);
  const stored = await client.getRecord(uri);
  assert.equal(stored.value.$type, POST_COLLECTION);
  assert.equal(facetedSpan(stored.value), 'https://rooms.example/r');
});

test('buildRoomPost omits the embed when no card is given', () => {
  const record = buildRoomPost({ text: 'live now', url: 'https://rooms.example/r' });
  assert.equal(record.embed, undefined);
});

test('buildRoomPost attaches a branded external-embed card', () => {
  const url = 'https://rooms.example/?room=at://did:plc:abc/community.beachwave.room/1';
  const record = buildRoomPost({
    text: `Office Hours is live — join: ${url}`,
    url,
    card: { title: '🎙 Office Hours · live on Beachwave', description: 'Open conversation for the community.' }
  });

  assert.equal(record.embed['$type'], 'app.bsky.embed.external');
  assert.equal(record.embed.external.uri, url);
  assert.equal(record.embed.external.title, '🎙 Office Hours · live on Beachwave');
  assert.equal(record.embed.external.description, 'Open conversation for the community.');
  assert.equal('thumb' in record.embed.external, false);
  // The link facet is still present alongside the embed.
  assert.equal(record.facets[0].features[0].uri, url);
});

import { encodeControl, decodeControl } from '../dist/sdk/media/control.js';
import grantSpeak from '../api/grant-speak.js';

test('control messages round-trip through the control channel format', () => {
  assert.deepEqual(decodeControl(encodeControl({ t: 'speak-request', name: 'alice' })), { t: 'speak-request', name: 'alice' });
  assert.deepEqual(decodeControl(encodeControl({ t: 'speak-request' })), { t: 'speak-request', name: undefined });
  assert.deepEqual(
    decodeControl(encodeControl({ t: 'speak-decision', target: 'did:plc:abc', approved: true })),
    { t: 'speak-decision', target: 'did:plc:abc', approved: true }
  );
});

test('decodeControl rejects malformed and unknown control payloads', () => {
  assert.equal(decodeControl(new TextEncoder().encode('nope')), null);
  assert.equal(decodeControl(new TextEncoder().encode(JSON.stringify({ t: 'speak-decision', target: 'x' }))), null);
  assert.equal(decodeControl(new TextEncoder().encode(JSON.stringify({ t: 'other' }))), null);
});

function mockRes() {
  const r = { headers: {} };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => { r.ended = true; return r; };
  return r;
}

test('media endpoints answer CORS preflight so cross-instance joins work', async () => {
  const res = mockRes();
  await grantSpeak({ method: 'OPTIONS', headers: {} }, res);
  assert.equal(res.code, 204);
  assert.equal(res.headers['access-control-allow-origin'], '*');
  assert.ok(res.ended);
});

test('grant-speak validates input and configuration', async () => {
  // Not configured -> 503
  let res = mockRes();
  await grantSpeak({ method: 'POST', body: { livekitRoom: 'r', identity: 'i' } }, res);
  assert.equal(res.code, 503);

  // Wrong method -> 405
  res = mockRes();
  await grantSpeak({ method: 'GET' }, res);
  assert.equal(res.code, 405);

  // Configured but missing fields -> 400
  process.env.LIVEKIT_API_KEY = 'k';
  process.env.LIVEKIT_API_SECRET = 'sssssssssssssssssssssssssssssss';
  process.env.LIVEKIT_URL = 'wss://demo.livekit.cloud';
  res = mockRes();
  await grantSpeak({ method: 'POST', body: { identity: 'i' } }, res);
  assert.equal(res.code, 400);
  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;
  delete process.env.LIVEKIT_URL;
});

import removeParticipant from '../api/remove-participant.js';

test('remove-participant validates input and configuration', async () => {
  let res = mockRes();
  await removeParticipant({ method: 'POST', body: { livekitRoom: 'r', identity: 'i' } }, res);
  assert.equal(res.code, 503); // not configured

  res = mockRes();
  await removeParticipant({ method: 'GET' }, res);
  assert.equal(res.code, 405);

  process.env.LIVEKIT_API_KEY = 'k';
  process.env.LIVEKIT_API_SECRET = 'sssssssssssssssssssssssssssssss';
  process.env.LIVEKIT_URL = 'wss://demo.livekit.cloud';
  res = mockRes();
  await removeParticipant({ method: 'POST', body: { livekitRoom: 'r' } }, res);
  assert.equal(res.code, 400); // missing identity
  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;
  delete process.env.LIVEKIT_URL;
});

import roomPage from '../api/room-page.js';

test('room-page injects per-room Open Graph tags and still serves the app', async () => {
  const shell = '<head>\n<!-- og:start -->\n<title>Beachwave</title>\n<meta property="og:title" content="Beachwave" />\n<!-- og:end -->\n</head><body><div id="root"></div></body>';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith('/index.html')) return { ok: true, text: async () => shell };
    if (u.includes('plc.directory')) return { ok: true, json: async () => ({ service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example' }] }) };
    if (u.includes('getRecord')) return { ok: true, json: async () => ({ value: { title: 'Office <Hours>', description: 'hang', status: 'live' } }) };
    return { ok: false };
  };
  try {
    let res = mockRes();
    res.send = (b) => { res.body = b; return res; };
    await roomPage({ headers: { host: 'beachwave.app' }, query: { room: 'at://did:plc:abc/community.beachwave.room/3k' } }, res);
    assert.equal(res.code, 200);
    assert.match(res.body, /Office &lt;Hours&gt; · live on Beachwave/);
    assert.match(res.body, /id="root"/); // app still loads
    assert.doesNotMatch(res.body, /Forkable live audio for ATProto/); // generic card replaced

    // No room param -> shell returned unchanged.
    res = mockRes();
    res.send = (b) => { res.body = b; return res; };
    await roomPage({ headers: { host: 'beachwave.app' }, query: {} }, res);
    assert.match(res.body, /<title>Beachwave<\/title>/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('control codec carries role-update pings', () => {
  assert.deepEqual(decodeControl(encodeControl({ t: 'role-update', target: 'did:plc:abc' })), { t: 'role-update', target: 'did:plc:abc' });
  assert.equal(decodeControl(new TextEncoder().encode(JSON.stringify({ t: 'role-update' }))), null);
});
