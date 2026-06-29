// Share a room to the host's Bluesky feed.
//
// This is intentionally separate from the Room lexicon: the room record stays
// provider-neutral, and announcing is an optional, app.bsky-specific action the
// SDK performs through the same RepositoryClient. The post carries a clickable
// link (a richtext facet) back to the room.

import type { RepositoryClient } from './types.js';
import { utf8ToBytes } from './atproto/encoding.js';

export const POST_COLLECTION = 'app.bsky.feed.post';

/** External-embed card metadata. Renders a branded link card on Bluesky. */
export interface RoomCard {
  /** Card title — e.g. the room title, branded with the app name. */
  title: string;
  /** Card description — e.g. the room agenda. */
  description: string;
  /** Optional blob ref for the card thumbnail (uploaded separately). */
  thumb?: unknown;
}

export interface RoomAnnouncement {
  /** Post body. If it contains `url`, that span is linked; otherwise `url` is appended. */
  text: string;
  /** Join URL to link. */
  url: string;
  /** Override the post timestamp (ISO 8601). Defaults to now. */
  createdAt?: string;
  /**
   * Optional external-embed card. When present, the post carries an
   * `app.bsky.embed.external` so Bluesky renders a branded card for the room
   * instead of falling back to whatever OpenGraph tags the link resolves to.
   */
  card?: RoomCard;
}

/** Build an `app.bsky.feed.post` record that links to a room. */
export function buildRoomPost(announcement: RoomAnnouncement): Record<string, unknown> {
  const { text, url, card } = announcement;
  const fullText = text.includes(url) ? text : text.trim() ? `${text} ${url}` : url;

  const byteStart = utf8ByteLength(fullText.slice(0, fullText.indexOf(url)));
  const byteEnd = byteStart + utf8ByteLength(url);

  const record: Record<string, unknown> = {
    $type: POST_COLLECTION,
    text: fullText,
    facets: [
      {
        index: { byteStart, byteEnd },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }]
      }
    ],
    createdAt: announcement.createdAt ?? new Date().toISOString()
  };

  if (card) {
    record.embed = {
      $type: 'app.bsky.embed.external',
      external: {
        uri: url,
        title: card.title,
        description: card.description,
        ...(card.thumb ? { thumb: card.thumb } : {})
      }
    };
  }

  return record;
}

/** Publish a room announcement post and return its AT URI. */
export async function announceRoom(
  client: RepositoryClient,
  announcement: RoomAnnouncement
): Promise<{ uri: string; cid?: string }> {
  return client.createRecord(POST_COLLECTION, buildRoomPost(announcement));
}

function utf8ByteLength(value: string): number {
  return utf8ToBytes(value).length;
}
