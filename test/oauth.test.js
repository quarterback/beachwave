import test from 'node:test';
import assert from 'node:assert/strict';

import {
  base64UrlDecode,
  base64UrlEncode,
  sha256Base64Url,
  utf8ToBytes,
  bytesToUtf8
} from '../dist/sdk/atproto/encoding.js';
import { generatePkce } from '../dist/sdk/atproto/pkce.js';
import { generateDpopKey, createDpopProof, dpopKeyThumbprint } from '../dist/sdk/atproto/dpop.js';
import { ecPublicThumbprint } from '../dist/sdk/atproto/jwk.js';
import { parseAtUri, formatAtUri } from '../dist/sdk/atproto/uri.js';
import {
  isDid,
  normalizeHandle,
  pdsFromDidDocument,
  handleFromDidDocument
} from '../dist/sdk/atproto/identity.js';

test('base64url round-trips arbitrary bytes', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 62, 63]);
  const encoded = base64UrlEncode(bytes);
  assert.doesNotMatch(encoded, /[+/=]/);
  assert.deepEqual(Array.from(base64UrlDecode(encoded)), Array.from(bytes));
});

test('utf8 helpers round-trip unicode', () => {
  const value = 'beachwave 🌊 café';
  assert.equal(bytesToUtf8(utf8ToBytes(value)), value);
});

test('sha256Base64Url matches the known digest of "abc"', async () => {
  // SHA-256("abc") base64url, unpadded.
  assert.equal(await sha256Base64Url('abc'), 'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
});

test('PKCE challenge is the base64url SHA-256 of the verifier', async () => {
  const pkce = await generatePkce();
  assert.equal(pkce.method, 'S256');
  assert.equal(pkce.challenge, await sha256Base64Url(pkce.verifier));
});

test('DPoP proof is a verifiable ES256 JWT with the bound key', async () => {
  const key = await generateDpopKey();
  const proof = await createDpopProof(key, {
    htm: 'post',
    htu: 'https://pds.example/xrpc/com.atproto.repo.createRecord?ignored=1',
    nonce: 'abc',
    accessToken: 'token-value'
  });

  const [encodedHeader, encodedPayload, encodedSignature] = proof.split('.');
  assert.ok(encodedHeader && encodedPayload && encodedSignature);

  const header = JSON.parse(bytesToUtf8(base64UrlDecode(encodedHeader)));
  assert.equal(header.typ, 'dpop+jwt');
  assert.equal(header.alg, 'ES256');
  assert.equal(header.jwk.crv, 'P-256');

  const payload = JSON.parse(bytesToUtf8(base64UrlDecode(encodedPayload)));
  assert.equal(payload.htm, 'POST');
  assert.equal(payload.htu, 'https://pds.example/xrpc/com.atproto.repo.createRecord');
  assert.equal(payload.nonce, 'abc');
  assert.equal(payload.ath, await sha256Base64Url('token-value'));
  assert.ok(typeof payload.jti === 'string' && payload.jti.length > 0);

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: header.jwk.x, y: header.jwk.y, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );
  const signingInput = utf8ToBytes(`${encodedHeader}.${encodedPayload}`);
  const verified = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    base64UrlDecode(encodedSignature),
    signingInput
  );
  assert.equal(verified, true);
});

test('JWK thumbprint is stable and matches the helper', async () => {
  const key = await generateDpopKey();
  const direct = await ecPublicThumbprint(key.publicJwk);
  const viaHelper = await dpopKeyThumbprint(key);
  assert.equal(direct, viaHelper);
  assert.equal(await ecPublicThumbprint(key.publicJwk), direct);
});

test('AT URI parsing and formatting round-trip', () => {
  const uri = 'at://did:plc:abc123/community.beachwave.room/3kabc';
  const parts = parseAtUri(uri);
  assert.deepEqual(parts, {
    authority: 'did:plc:abc123',
    collection: 'community.beachwave.room',
    rkey: '3kabc'
  });
  assert.equal(formatAtUri(parts), uri);
  assert.throws(() => parseAtUri('https://example.com'), /Not an AT URI/);
  assert.throws(() => parseAtUri('at://did:plc:abc/only-two'), /Malformed/);
});

test('identity helpers parse handles and DID documents', () => {
  assert.equal(isDid('did:plc:abc'), true);
  assert.equal(isDid('alice.bsky.social'), false);
  assert.equal(normalizeHandle('  @Alice.BSky.Social '), 'alice.bsky.social');

  const doc = {
    alsoKnownAs: ['at://alice.bsky.social'],
    service: [
      { id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example/' }
    ]
  };
  assert.equal(pdsFromDidDocument(doc), 'https://pds.example');
  assert.equal(handleFromDidDocument(doc), 'alice.bsky.social');
  assert.throws(() => pdsFromDidDocument({ service: [] }), /no ATProto PDS/);
});
