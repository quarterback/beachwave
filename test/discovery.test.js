import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRoom,
  touchRoom,
  isRoomLive,
  discoverLiveRooms,
  mapWithConcurrency,
  ROOM_COLLECTION,
  ROOM_LIVE_TTL_MS
} from '../dist/sdk/index.js';
import { MemoryRepositoryClient } from '../dist/sdk/memory-client.js';

const NOW = Date.parse('2026-06-30T00:00:00.000Z');
const minutesAgo = (m) => new Date(NOW - m * 60_000).toISOString();

test('isRoomLive honours status and the heartbeat TTL', () => {
  const base = { title: 'R', livekitRoom: 'r', createdAt: minutesAgo(60) };
  assert.equal(isRoomLive({ ...base, status: 'ended' }, NOW), false);
  assert.equal(isRoomLive({ ...base, status: 'live' }, NOW), true); // no heartbeat → status only
  assert.equal(isRoomLive({ ...base, status: 'live', lastActiveAt: minutesAgo(1) }, NOW), true);
  assert.equal(isRoomLive({ ...base, status: 'live', lastActiveAt: minutesAgo(10) }, NOW), false);
});

test('ROOM_LIVE_TTL_MS is a sane window', () => {
  assert.equal(ROOM_LIVE_TTL_MS, 5 * 60 * 1000);
});

test('touchRoom refreshes lastActiveAt and keeps the room live', async () => {
  const client = new MemoryRepositoryClient('did:example:host');
  const room = await createRoom(client, { title: 'Standup' });
  assert.ok(room.record.lastActiveAt, 'created rooms carry a heartbeat');

  const touched = await touchRoom(client, room.uri);
  assert.equal(touched.record.status, 'live');
  assert.equal(touched.record.createdAt, room.record.createdAt);
  assert.ok(Date.parse(touched.record.lastActiveAt) >= Date.parse(room.record.lastActiveAt));
});

test('discoverLiveRooms returns only fresh live rooms, newest first', async () => {
  const client = new MemoryRepositoryClient('did:example:host');
  const repo = 'did:example:host';
  await client.createRecord(ROOM_COLLECTION, { title: 'Fresh A', livekitRoom: 'a', status: 'live', createdAt: minutesAgo(2), lastActiveAt: minutesAgo(1) });
  await client.createRecord(ROOM_COLLECTION, { title: 'Fresh B', livekitRoom: 'b', status: 'live', createdAt: minutesAgo(1), lastActiveAt: minutesAgo(1) });
  await client.createRecord(ROOM_COLLECTION, { title: 'Stale', livekitRoom: 'c', status: 'live', createdAt: minutesAgo(30), lastActiveAt: minutesAgo(20) });
  await client.createRecord(ROOM_COLLECTION, { title: 'Ended', livekitRoom: 'd', status: 'ended', createdAt: minutesAgo(5), endedAt: minutesAgo(4), lastActiveAt: minutesAgo(1) });

  const live = await discoverLiveRooms(client, [repo, 'did:example:nobody'], { now: NOW });
  assert.deepEqual(live.map((r) => r.record.title), ['Fresh B', 'Fresh A']);
});

test('mapWithConcurrency preserves order and bounds parallelism', async () => {
  const order = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 10);
  assert.deepEqual(order, [10, 20, 30, 40, 50]);

  let active = 0;
  let max = 0;
  await mapWithConcurrency([...Array(12).keys()], 3, async () => {
    active += 1;
    max = Math.max(max, active);
    await new Promise((r) => setTimeout(r, 3));
    active -= 1;
  });
  assert.ok(max <= 3, `max in flight ${max} should be <= 3`);
});

test('createRoom records the serviceEndpoint so rooms are joinable cross-instance', async () => {
  const client = new MemoryRepositoryClient('did:example:host');
  const room = await createRoom(client, { title: 'Cross', serviceEndpoint: 'https://host.example/' });
  assert.equal(room.record.serviceEndpoint, 'https://host.example'); // trailing slash trimmed
  const stored = await client.getRecord(room.uri);
  assert.equal(stored.value.serviceEndpoint, 'https://host.example');
});

import { addRoomHost, removeRoomHost } from '../dist/sdk/index.js';

test('addRoomHost / removeRoomHost manage the moderator list', async () => {
  const client = new MemoryRepositoryClient('did:example:host');
  const room = await createRoom(client, { title: 'Mods' });
  assert.deepEqual(room.record.hosts, ['did:example:host']); // owner is a host

  const withMod = await addRoomHost(client, room.uri, 'did:example:mod');
  assert.ok(withMod.record.hosts.includes('did:example:mod'));
  assert.ok(withMod.record.hosts.includes('did:example:host'));
  assert.equal(withMod.record.status, 'live'); // other fields preserved

  // idempotent
  const again = await addRoomHost(client, room.uri, 'did:example:mod');
  assert.equal(again.record.hosts.filter((h) => h === 'did:example:mod').length, 1);

  const without = await removeRoomHost(client, room.uri, 'did:example:mod');
  assert.equal(without.record.hosts.includes('did:example:mod'), false);
});
