// Media transport boundary.
//
// Beachwave owns room lifecycle, identity, participant state, permissions, and
// metadata. The media layer (LiveKit) owns transport, audio routing, speaking,
// the microphone, and WebRTC. These interfaces are the only contract between
// the two, so the protocol never leaks media-provider details and the media
// provider never needs to understand ATProto.

export type ParticipantRole = 'host' | 'speaker' | 'listener';

export interface MediaJoinRequest {
  /** Media room identifier carried in the Room record's `livekitRoom` field. */
  livekitRoom: string;
  /** Stable participant identity (the ATProto DID). */
  identity: string;
  /** Human-readable name shown to other participants. */
  displayName?: string;
  /** Role determines publish permission; hosts and speakers may publish audio. */
  role: ParticipantRole;
}

/** Connection details for a media room, minted by a trusted token service. */
export interface MediaGrant {
  /** WebRTC server URL (e.g. wss://...). */
  url: string;
  /** Signed access token authorizing this participant. */
  token: string;
}

/** Mints media grants. Token signing requires a server-side API secret, so this
 *  always talks to a trusted endpoint rather than signing in the browser. */
export interface MediaTokenProvider {
  getGrant(request: MediaJoinRequest): Promise<MediaGrant>;
}

/** An active media connection. */
export interface MediaSession {
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  leave(): Promise<void>;
}

/** Establishes media sessions for resolved rooms. */
export interface MediaController {
  join(request: MediaJoinRequest): Promise<MediaSession>;
}
