// LiveKit implementation of the media boundary.
//
// Token minting requires a LiveKit API key/secret, which must never live in a
// browser. `HttpMediaTokenProvider` therefore fetches grants from a trusted
// endpoint the deployer operates. The LiveKit browser SDK is loaded on demand
// from a CDN so the reference client keeps its zero-dependency, no-bundler
// build; deployments that bundle can swap this for a local import.

import type {
  ChatMessage,
  MediaController,
  MediaGrant,
  MediaJoinRequest,
  MediaParticipant,
  MediaRoomState,
  MediaSession,
  MediaTokenProvider
} from './types.js';
import { CHAT_TOPIC, decodeChat, encodeChat } from './chat.js';

const LIVEKIT_CLIENT_URL = 'https://esm.sh/livekit-client@2';

/** Fetches media grants from a deployer-operated token endpoint. */
export class HttpMediaTokenProvider implements MediaTokenProvider {
  constructor(private readonly endpoint: string) {}

  async getGrant(request: MediaJoinRequest): Promise<MediaGrant> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(request)
    });
    if (!res.ok) throw new Error(`Media token request failed (${res.status})`);
    const grant = (await res.json()) as MediaGrant;
    if (!grant.url || !grant.token) throw new Error('Media token endpoint returned an incomplete grant');
    return grant;
  }
}

export class LiveKitMediaController implements MediaController {
  constructor(private readonly tokens: MediaTokenProvider) {}

  async join(request: MediaJoinRequest): Promise<MediaSession> {
    const grant = await this.tokens.getGrant(request);
    // Dynamic import via a runtime string keeps the LiveKit SDK out of the
    // TypeScript build graph; deployments may replace this with a static import.
    const livekit = (await import(/* @vite-ignore */ LIVEKIT_CLIENT_URL)) as LiveKitModule;
    const { Room, RoomEvent } = livekit;
    const room = new Room();

    const canPublish = request.role === 'host' || request.role === 'speaker';
    const stateListeners = new Set<(state: MediaRoomState) => void>();
    const chatListeners = new Set<(message: ChatMessage) => void>();

    // Hidden container holding the <audio> elements for remote participants.
    // Without attaching subscribed audio tracks, nobody is actually heard.
    const audioSink = document.createElement('div');
    audioSink.style.display = 'none';
    document.body.appendChild(audioSink);

    const computeState = (): MediaRoomState => {
      const everyone: LiveKitParticipant[] = [room.localParticipant, ...room.remoteParticipants.values()];
      const participants: MediaParticipant[] = everyone.map((p) => ({
        identity: p.identity,
        name: p.name || undefined,
        isLocal: p === room.localParticipant,
        isSpeaking: Boolean(p.isSpeaking),
        canSpeak: p === room.localParticipant ? canPublish : Boolean(p.permissions?.canPublish)
      }));
      return {
        connected: String(room.state) === 'connected',
        audioBlocked: room.canPlaybackAudio === false,
        participants
      };
    };

    const emitState = () => {
      const snapshot = computeState();
      for (const listener of stateListeners) listener(snapshot);
    };

    room
      .on(RoomEvent.TrackSubscribed, (track: LiveKitTrack) => {
        if (track.kind === 'audio') audioSink.appendChild(track.attach());
      })
      .on(RoomEvent.TrackUnsubscribed, (track: LiveKitTrack) => {
        for (const element of track.detach()) element.remove();
      })
      .on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: LiveKitParticipant, _kind?: unknown, topic?: string) => {
        if (topic && topic !== CHAT_TOPIC) return;
        const decoded = decodeChat(payload);
        if (!decoded) return;
        emitChat({
          from: participant?.identity ?? 'unknown',
          name: decoded.name ?? participant?.name ?? undefined,
          text: decoded.text,
          at: decoded.at,
          isLocal: false
        });
      })
      .on(RoomEvent.ParticipantConnected, emitState)
      .on(RoomEvent.ParticipantDisconnected, emitState)
      .on(RoomEvent.ActiveSpeakersChanged, emitState)
      .on(RoomEvent.TrackMuted, emitState)
      .on(RoomEvent.TrackUnmuted, emitState)
      .on(RoomEvent.ConnectionStateChanged, emitState)
      .on(RoomEvent.AudioPlaybackStatusChanged, emitState)
      .on(RoomEvent.Disconnected, emitState);

    function emitChat(message: ChatMessage): void {
      for (const listener of chatListeners) listener(message);
    }

    // The microphone is enabled by the caller from a user gesture, not here:
    // mobile browsers reject capture requested outside a direct interaction.
    await room.connect(grant.url, grant.token);
    emitState();

    return {
      getState: computeState,
      subscribe(listener) {
        stateListeners.add(listener);
        listener(computeState());
        return () => stateListeners.delete(listener);
      },
      onChat(listener) {
        chatListeners.add(listener);
        return () => chatListeners.delete(listener);
      },
      async startAudio() {
        await room.startAudio();
        emitState();
      },
      async setMicrophoneEnabled(enabled) {
        await room.localParticipant.setMicrophoneEnabled(enabled);
        emitState();
      },
      async sendChat(text) {
        const trimmed = text.trim();
        if (!trimmed) return;
        const at = Date.now();
        const name = room.localParticipant.name || request.displayName;
        await room.localParticipant.publishData(encodeChat(trimmed, at, name), {
          reliable: true,
          topic: CHAT_TOPIC
        });
        // DataReceived does not fire for the sender, so echo locally.
        emitChat({ from: room.localParticipant.identity, name, text: trimmed, at, isLocal: true });
      },
      async leave() {
        await room.disconnect();
        audioSink.remove();
        stateListeners.clear();
        chatListeners.clear();
      }
    };
  }
}

// Minimal structural typing for the parts of livekit-client we use. The module
// is loaded at runtime, so these only need to cover our call sites.
interface LiveKitModule {
  Room: new () => LiveKitRoom;
  RoomEvent: Record<string, string>;
}

interface LiveKitRoom {
  state: string;
  canPlaybackAudio: boolean;
  localParticipant: LiveKitLocalParticipant;
  remoteParticipants: Map<string, LiveKitParticipant>;
  on(event: string, handler: (...args: never[]) => void): LiveKitRoom;
  connect(url: string, token: string): Promise<void>;
  startAudio(): Promise<void>;
  disconnect(): Promise<void>;
}

interface LiveKitParticipant {
  identity: string;
  name?: string;
  isSpeaking?: boolean;
  permissions?: { canPublish?: boolean };
}

interface LiveKitLocalParticipant extends LiveKitParticipant {
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  publishData(data: Uint8Array, options?: { reliable?: boolean; topic?: string }): Promise<void>;
}

interface LiveKitTrack {
  kind: string;
  attach(): HTMLMediaElement;
  detach(): HTMLMediaElement[];
}
