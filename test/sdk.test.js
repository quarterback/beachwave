import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, endRoom, joinRoom, listRooms } from '../dist/sdk/index.js';
import { MemoryRepositoryClient } from '../dist/sdk/memory-client.js';

test('creates, lists, joins, and ends a room', async () => {
  const client = new MemoryRepositoryClient('did:example:host');
  const room = await createRoom(client, { title: 'Morning Dive', description: 'Daily ocean audio' });

  assert.equal(room.record.status, 'live');
  assert.equal(room.record.hosts?.[0], 'did:example:host');
  assert.match(room.record.livekitRoom, /morning-dive/);

  assert.equal((await listRooms(client)).length, 1);
  assert.equal((await joinRoom(client, room.uri)).livekitRoom, room.record.livekitRoom);

  const ended = await endRoom(client, room.uri);
  assert.equal(ended.record.status, 'ended');
  assert.equal((await listRooms(client)).length, 0);
  await assert.rejects(() => joinRoom(client, room.uri), /ended room/);
});
