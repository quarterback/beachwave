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
