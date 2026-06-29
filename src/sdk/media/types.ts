// Media transport boundary.
//
// Beachwave owns room lifecycle, identity, participant state, permissions, and
// metadata. The media layer (LiveKit) owns transport, audio routing, speaking,
// the microphone, WebRTC, and the ephemeral in-room data channel. These
// interfaces are the only contract between the two, so the protocol never leaks
// media-provider details and the media provider never needs to understand
// ATProto.

import type { SpeakDecision, SpeakRequest } from './control.js';
export type { SpeakDecision, SpeakRequest } from './control.js';

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

/** A participant currently connected to a media room. */
export interface MediaParticipant {
  /** ATProto DID. */
  identity: string;
  /** Display name, when the participant published one. */
  name?: string;
  /** True for the local participant. */
  isLocal: boolean;
  /** True while the participant is actively speaking. */
  isSpeaking: boolean;
  /** True when the participant is permitted to publish audio. */
  canSpeak: boolean;
}

/** A snapshot of who is in the room. */
export interface MediaRoomState {
  connected: boolean;
  participants: MediaParticipant[];
  /** True when the browser is blocking audio playback until a user gesture
   *  (common on mobile/iOS). Resolve by calling `startAudio()` from a tap. */
  audioBlocked: boolean;
}

/** An ephemeral in-room text message (not persisted to ATProto). */
export interface ChatMessage {
  /** Sender DID. */
  from: string;
  /** Sender display name, when known. */
  name?: string;
  text: string;
  /** Epoch milliseconds. */
  at: number;
  /** True when this client sent the message. */
  isLocal: boolean;
}

/** An active media connection. */
export interface MediaSession {
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  /** Unlock audio playback after a user gesture (required on mobile/iOS). */
  startAudio(): Promise<void>;
  /** Send an ephemeral text message to everyone in the room. */
  sendChat(text: string): Promise<void>;
  /** Ask the host(s) for permission to speak (listener action). */
  requestToSpeak(): Promise<void>;
  /** Notify a requester of the host's decision (host action). The actual
   *  permission grant is performed separately, server-side. */
  decideSpeak(target: string, approved: boolean): Promise<void>;
  /** Subscribe to incoming speak requests (host receives these). */
  onSpeakRequest(listener: (request: SpeakRequest) => void): () => void;
  /** Subscribe to host decisions (requester receives these). */
  onSpeakDecision(listener: (decision: SpeakDecision) => void): () => void;
  /** Current presence snapshot. */
  getState(): MediaRoomState;
  /** Subscribe to presence/speaking changes. Fires immediately with current state. Returns an unsubscribe function. */
  subscribe(listener: (state: MediaRoomState) => void): () => void;
  /** Subscribe to incoming and locally-sent chat messages. Returns an unsubscribe function. */
  onChat(listener: (message: ChatMessage) => void): () => void;
  leave(): Promise<void>;
}

/** Establishes media sessions for resolved rooms. */
export interface MediaController {
  join(request: MediaJoinRequest): Promise<MediaSession>;
}
