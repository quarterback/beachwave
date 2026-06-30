import type { BeachwaveRoomRecord } from './types.js';

export function assertRoomRecord(value: unknown): asserts value is BeachwaveRoomRecord {
  if (!value || typeof value !== 'object') throw new Error('Room record must be an object');
  const record = value as Record<string, unknown>;
  if (typeof record.title !== 'string' || record.title.trim().length === 0) throw new Error('Room title is required');
  if (record.title.length > 120) throw new Error('Room title must be 120 characters or fewer');
  if (record.description !== undefined && (typeof record.description !== 'string' || record.description.length > 1000)) throw new Error('Room description must be 1000 characters or fewer');
  if (typeof record.livekitRoom !== 'string' || record.livekitRoom.trim().length === 0) throw new Error('LiveKit room is required');
  if (record.status !== 'live' && record.status !== 'ended') throw new Error('Room status must be live or ended');
  if (typeof record.createdAt !== 'string' || Number.isNaN(Date.parse(record.createdAt))) throw new Error('createdAt must be an ISO datetime');
  if (record.lastActiveAt !== undefined && (typeof record.lastActiveAt !== 'string' || Number.isNaN(Date.parse(record.lastActiveAt)))) throw new Error('lastActiveAt must be an ISO datetime');
  if (record.endedAt !== undefined && (typeof record.endedAt !== 'string' || Number.isNaN(Date.parse(record.endedAt)))) throw new Error('endedAt must be an ISO datetime');
  if (record.hosts !== undefined && (!Array.isArray(record.hosts) || record.hosts.some((host) => typeof host !== 'string' || !host.startsWith('did:')))) throw new Error('hosts must be DID strings');
}

export function makeLiveKitRoomName(did: string, title: string, now = new Date()): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48) || 'room';
  return `${did.replace(/[^a-zA-Z0-9]/g, '_')}_${slug}_${now.getTime()}`;
}
