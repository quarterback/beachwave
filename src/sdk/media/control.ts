// Wire format for ephemeral room-moderation signaling carried over the media
// data channel (a separate topic from chat). Kept as small pure functions so it
// can be unit tested without a live transport.
//
// These messages coordinate "request to speak" / host approval. The actual
// publish-permission change is performed server-side (see api/grant-speak.js);
// these signals only drive the request and the host's decision notification.

import { bytesToUtf8, utf8ToBytes } from '../atproto/encoding.js';

/** Data-channel topic used to namespace moderation control messages. */
export const CONTROL_TOPIC = 'beachwave.control';

export interface SpeakRequest {
  /** DID of the participant asking to speak. */
  identity: string;
  name?: string;
}

export interface SpeakDecision {
  /** DID the decision applies to. */
  target: string;
  approved: boolean;
}

type ControlWire =
  | { t: 'speak-request'; name?: string }
  | { t: 'speak-decision'; target: string; approved: boolean };

export function encodeControl(message: ControlWire): Uint8Array {
  return utf8ToBytes(JSON.stringify(message));
}

export function decodeControl(bytes: Uint8Array): ControlWire | null {
  try {
    const parsed = JSON.parse(bytesToUtf8(bytes)) as Partial<ControlWire>;
    if (parsed.t === 'speak-request') {
      return { t: 'speak-request', name: typeof parsed.name === 'string' ? parsed.name : undefined };
    }
    if (parsed.t === 'speak-decision' && typeof parsed.target === 'string' && typeof parsed.approved === 'boolean') {
      return { t: 'speak-decision', target: parsed.target, approved: parsed.approved };
    }
    return null;
  } catch {
    return null;
  }
}
