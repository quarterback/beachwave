// Low-level encoding helpers shared by the ATProto OAuth implementation.
//
// Everything here is framework-free and relies only on Web Platform globals
// (`crypto`, `TextEncoder`, `btoa`/`atob`) so the SDK can run in a browser or
// in a modern Node runtime without any dependencies.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8ToBytes(value: string): Uint8Array {
  return encoder.encode(value);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/** Base64url-encode bytes without padding (RFC 7515 §2). */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode base64url (with or without padding) back to bytes. */
export function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Serialize a value to JSON and base64url-encode it (used for JWT segments). */
export function jsonToBase64Url(value: unknown): string {
  return base64UrlEncode(utf8ToBytes(JSON.stringify(value)));
}

/** SHA-256 digest of a string or byte array. */
export async function sha256(input: string | Uint8Array): Promise<Uint8Array> {
  const bytes = typeof input === 'string' ? utf8ToBytes(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return new Uint8Array(digest);
}

/** SHA-256 digest of a string, returned base64url-encoded. */
export async function sha256Base64Url(input: string): Promise<string> {
  return base64UrlEncode(await sha256(input));
}

/** A cryptographically random base64url token, 32 bytes of entropy by default. */
export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** Current time in whole seconds since the Unix epoch. */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
