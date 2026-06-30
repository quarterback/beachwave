import test from 'node:test';
import assert from 'node:assert/strict';

import { isHost } from '../lib/auth.js';

const room = (authority, hosts) => ({ uri: `at://${authority}/community.beachwave.room/1`, authority, value: { hosts } });

test('isHost: the room owner is always a host', () => {
  assert.equal(isHost('did:plc:owner', room('did:plc:owner', [])), true);
  // Owner is a host even when not listed in the hosts array.
  assert.equal(isHost('did:plc:owner', room('did:plc:owner', ['did:plc:other'])), true);
});

test('isHost: a listed co-host is a host', () => {
  assert.equal(isHost('did:plc:mod', room('did:plc:owner', ['did:plc:mod'])), true);
});

test('isHost: a non-listed participant is not a host', () => {
  assert.equal(isHost('did:plc:guest', room('did:plc:owner', ['did:plc:mod'])), false);
  assert.equal(isHost('did:plc:guest', room('did:plc:owner', [])), false);
});

test('isHost: defends against missing inputs and malformed records', () => {
  assert.equal(isHost('', room('did:plc:owner', [])), false);
  assert.equal(isHost('did:plc:owner', null), false);
  assert.equal(isHost(null, room('did:plc:owner', [])), false);
  // hosts not an array (e.g. older/foreign records) must not throw.
  assert.equal(isHost('did:plc:guest', { authority: 'did:plc:owner', value: {} }), false);
  assert.equal(isHost('did:plc:guest', { authority: 'did:plc:owner', value: { hosts: 'nope' } }), false);
});
