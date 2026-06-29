export const ROOM_COLLECTION = 'community.airwave.room' as const;

export type RoomStatus = 'live' | 'ended';

export interface AirwaveRoomRecord {
  title: string;
  description?: string;
  livekitRoom: string;
  status: RoomStatus;
  createdAt: string;
  endedAt?: string;
  hosts?: string[];
}

export interface AirwaveRoom {
  uri: string;
  cid?: string;
  authorDid: string;
  record: AirwaveRoomRecord;
}

export interface CreateRoomInput {
  title: string;
  description?: string;
  livekitRoom?: string;
  hosts?: string[];
}

export interface JoinRoomResult {
  room: AirwaveRoom;
  livekitRoom: string;
}

export interface RepositoryClient {
  did: string;
  createRecord(collection: string, record: unknown): Promise<{ uri: string; cid?: string }>;
  updateRecord(uri: string, record: unknown): Promise<{ uri: string; cid?: string }>;
  getRecord(uri: string): Promise<{ uri: string; cid?: string; value: unknown }>;
  listRecords(collection: string, repo?: string): Promise<Array<{ uri: string; cid?: string; value: unknown }>>;
}
