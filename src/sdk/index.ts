import { assertRoomRecord, makeLiveKitRoomName } from './validation.js';
import { mapWithConcurrency } from './discovery.js';
import { ROOM_COLLECTION, type BeachwaveRoom, type BeachwaveRoomRecord, type CreateRoomInput, type JoinRoomResult, type RepositoryClient } from './types.js';

function toRoom(uri: string, cid: string | undefined, value: unknown): BeachwaveRoom {
  assertRoomRecord(value);
  const authorDid = uri.startsWith('at://') ? uri.slice(5).split('/')[0] : '';
  return { uri, cid, authorDid, record: value };
}

/**
 * A live room whose `lastActiveAt` heartbeat is older than this is treated as
 * ended (e.g. the host closed the tab without ending it). Clients should send a
 * heartbeat more often than this — see `touchRoom`.
 */
export const ROOM_LIVE_TTL_MS = 5 * 60 * 1000;

export async function createRoom(client: RepositoryClient, input: CreateRoomInput): Promise<BeachwaveRoom> {
  const now = new Date().toISOString();
  const record: BeachwaveRoomRecord = {
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    livekitRoom: input.livekitRoom ?? makeLiveKitRoomName(client.did, input.title),
    serviceEndpoint: input.serviceEndpoint?.replace(/\/+$/, '') || undefined,
    status: 'live',
    createdAt: now,
    lastActiveAt: now,
    hosts: Array.from(new Set([client.did, ...(input.hosts ?? [])]))
  };
  assertRoomRecord(record);
  const created = await client.createRecord(ROOM_COLLECTION, record);
  return toRoom(created.uri, created.cid, record);
}

/** Refresh a room's heartbeat so it keeps appearing live. Host action. */
export async function touchRoom(client: RepositoryClient, uri: string): Promise<BeachwaveRoom> {
  const existing = await client.getRecord(uri);
  const record = { ...(existing.value as object), lastActiveAt: new Date().toISOString() };
  assertRoomRecord(record);
  const updated = await client.updateRecord(uri, record);
  return toRoom(updated.uri, updated.cid, record);
}

/** Add a moderator (co-host) DID to a room. Owner action — writes the owner's record. */
export async function addRoomHost(client: RepositoryClient, uri: string, did: string): Promise<BeachwaveRoom> {
  const existing = await client.getRecord(uri);
  const value = existing.value as BeachwaveRoomRecord;
  const hosts = Array.from(new Set([...(value.hosts ?? []), did]));
  const record = { ...value, hosts };
  assertRoomRecord(record);
  const updated = await client.updateRecord(uri, record);
  return toRoom(updated.uri, updated.cid, record);
}

/** Remove a moderator DID from a room. Owner action. */
export async function removeRoomHost(client: RepositoryClient, uri: string, did: string): Promise<BeachwaveRoom> {
  const existing = await client.getRecord(uri);
  const value = existing.value as BeachwaveRoomRecord;
  const hosts = (value.hosts ?? []).filter((host) => host !== did);
  const record = { ...value, hosts };
  assertRoomRecord(record);
  const updated = await client.updateRecord(uri, record);
  return toRoom(updated.uri, updated.cid, record);
}

/** Whether a room should be presented as joinable right now. */
export function isRoomLive(record: BeachwaveRoomRecord, now: number = Date.now(), ttlMs: number = ROOM_LIVE_TTL_MS): boolean {
  if (record.status !== 'live') return false;
  // No heartbeat (older records, or other clients) → fall back to status only.
  if (!record.lastActiveAt) return true;
  const last = Date.parse(record.lastActiveAt);
  if (Number.isNaN(last)) return true;
  return now - last < ttlMs;
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

/**
 * Discover live rooms across many repositories (e.g. the accounts the viewer
 * follows). Fault-tolerant: a repository that fails or has no rooms is skipped.
 * Results are filtered to currently-live rooms and sorted newest-first.
 */
export async function discoverLiveRooms(
  client: RepositoryClient,
  repos: string[],
  options: { concurrency?: number; now?: number } = {}
): Promise<BeachwaveRoom[]> {
  const now = options.now ?? Date.now();
  const lists = await mapWithConcurrency(repos, options.concurrency ?? 8, (repo) =>
    client.listRecords(ROOM_COLLECTION, repo).catch(() => [])
  );
  const rooms = lists.flat().flatMap((item) => {
    try {
      return [toRoom(item.uri, item.cid, item.value)];
    } catch {
      return [];
    }
  });
  return rooms
    .filter((room) => isRoomLive(room.record, now))
    .sort((a, b) => b.record.createdAt.localeCompare(a.record.createdAt));
}

export * from './types.js';
export * from './atproto/index.js';
export * from './media/types.js';
export { HttpMediaTokenProvider, LiveKitMediaController, type LiveKitControllerOptions } from './media/livekit.js';
export { CHAT_TOPIC, encodeChat, decodeChat } from './media/chat.js';
export { CONTROL_TOPIC, encodeControl, decodeControl, type SpeakRequest, type SpeakDecision } from './media/control.js';
export { announceRoom, buildRoomPost, POST_COLLECTION, type RoomAnnouncement } from './announce.js';
export { listFollowDids, mapWithConcurrency, type ListFollowsOptions } from './discovery.js';
