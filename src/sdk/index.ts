import { assertRoomRecord, makeLiveKitRoomName } from './validation.js';
import { ROOM_COLLECTION, type BeachwaveRoom, type BeachwaveRoomRecord, type CreateRoomInput, type JoinRoomResult, type RepositoryClient } from './types.js';

function toRoom(uri: string, cid: string | undefined, value: unknown): BeachwaveRoom {
  assertRoomRecord(value);
  const authorDid = uri.startsWith('at://') ? uri.slice(5).split('/')[0] : '';
  return { uri, cid, authorDid, record: value };
}

export async function createRoom(client: RepositoryClient, input: CreateRoomInput): Promise<BeachwaveRoom> {
  const record: BeachwaveRoomRecord = {
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    livekitRoom: input.livekitRoom ?? makeLiveKitRoomName(client.did, input.title),
    status: 'live',
    createdAt: new Date().toISOString(),
    hosts: Array.from(new Set([client.did, ...(input.hosts ?? [])]))
  };
  assertRoomRecord(record);
  const created = await client.createRecord(ROOM_COLLECTION, record);
  return toRoom(created.uri, created.cid, record);
}

export async function endRoom(client: RepositoryClient, uri: string): Promise<BeachwaveRoom> {
  const existing = await client.getRecord(uri);
  const record = { ...(existing.value as object), status: 'ended', endedAt: new Date().toISOString() };
  assertRoomRecord(record);
  const updated = await client.updateRecord(uri, record);
  return toRoom(updated.uri, updated.cid, record);
}

export async function getRoom(client: RepositoryClient, uri: string): Promise<BeachwaveRoom> {
  const found = await client.getRecord(uri);
  return toRoom(found.uri, found.cid, found.value);
}

export async function listRooms(client: RepositoryClient, repos: string[] = [client.did]): Promise<BeachwaveRoom[]> {
  const records = await Promise.all(repos.map((repo) => client.listRecords(ROOM_COLLECTION, repo)));
  return records.flat().map((item) => toRoom(item.uri, item.cid, item.value)).filter((room) => room.record.status === 'live');
}

export async function joinRoom(client: RepositoryClient, uri: string): Promise<JoinRoomResult> {
  const room = await getRoom(client, uri);
  if (room.record.status !== 'live') throw new Error('Cannot join an ended room');
  return { room, livekitRoom: room.record.livekitRoom };
}

export async function leaveRoom(): Promise<void> {
  // Room membership is local to the media session until the participant lexicon is introduced.
}

export * from './types.js';
export * from './atproto/index.js';
export * from './media/types.js';
export { HttpMediaTokenProvider, LiveKitMediaController } from './media/livekit.js';
