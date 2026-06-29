// LiveKit implementation of the media boundary.
//
// Token minting requires a LiveKit API key/secret, which must never live in a
// browser. `HttpMediaTokenProvider` therefore fetches grants from a trusted
// endpoint the deployer operates. The LiveKit browser SDK is loaded on demand
// from a CDN so the reference client keeps its zero-dependency, no-bundler
// build; deployments that bundle can swap this for a local import.

import type {
  MediaController,
  MediaGrant,
  MediaJoinRequest,
  MediaSession,
  MediaTokenProvider
} from './types.js';

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
    const room = new livekit.Room();
    await room.connect(grant.url, grant.token);
    const canPublish = request.role === 'host' || request.role === 'speaker';
    if (canPublish) {
      await room.localParticipant.setMicrophoneEnabled(true);
    }
    return {
      async setMicrophoneEnabled(enabled: boolean) {
        await room.localParticipant.setMicrophoneEnabled(enabled);
      },
      async leave() {
        await room.disconnect();
      }
    };
  }
}

interface LiveKitModule {
  Room: new () => {
    connect(url: string, token: string): Promise<void>;
    disconnect(): Promise<void>;
    localParticipant: { setMicrophoneEnabled(enabled: boolean): Promise<void> };
  };
}
