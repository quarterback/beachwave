// Wire format for the ephemeral in-room chat carried over the media data
// channel. Kept as small pure functions so it can be unit tested without a live
// transport.

import { bytesToUtf8, utf8ToBytes } from '../atproto/encoding.js';

/** Data-channel topic used to namespace chat messages. */
export const CHAT_TOPIC = 'beachwave.chat';

interface ChatWire {
  t: 'chat';
  text: string;
  at: number;
  name?: string;
}

export function encodeChat(text: string, at: number, name?: string): Uint8Array {
  const payload: ChatWire = { t: 'chat', text, at, name };
  return utf8ToBytes(JSON.stringify(payload));
}

export function decodeChat(bytes: Uint8Array): { text: string; at: number; name?: string } | null {
  try {
    const parsed = JSON.parse(bytesToUtf8(bytes)) as Partial<ChatWire>;
    if (parsed.t !== 'chat' || typeof parsed.text !== 'string') return null;
    return {
      text: parsed.text,
      at: typeof parsed.at === 'number' ? parsed.at : 0,
      name: typeof parsed.name === 'string' ? parsed.name : undefined
    };
  } catch {
    return null;
  }
}
