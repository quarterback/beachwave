# Beachwave Product Design Requirements

## 1. Overview

Beachwave is an open reference implementation for live audio on ATProto. It defines the protocol primitives needed for decentralized live audio applications and validates them with a small working web client.

The reference client is not the protocol. It exists to prove that the lexicons, SDK, discovery model, and room lifecycle are sufficient for another developer to build a different interoperable live audio client.

## 2. Goals

1. Define an interoperable protocol for creating, discovering, joining, and ending live audio rooms using ATProto records.
2. Provide a complete reference application that exercises every part of that protocol in a real implementation.
3. Keep the protocol implementation-agnostic so multiple clients can interoperate using the same room records.
4. Keep the reference implementation intentionally small, understandable, and easy to extend.

## 3. Non-goals

* Beachwave does not define a new identity system; ATProto remains the source of identity.
* Beachwave does not store live audio media in ATProto repositories.
* Beachwave does not require third-party clients to copy the reference UI.
* The initial implementation does not need every future lexicon; only the Room record is required for the first milestone.
* The reference SDK should hide raw repository operations, but it should not prevent advanced clients from using repository APIs directly.

## 4. Design principles

* ATProto is the source of identity.
* Room metadata is stored as ATProto records.
* Media transport is handled by LiveKit.
* The protocol is implementation-agnostic.
* Multiple clients should be able to interoperate using the same room records.
* All protocol components are open source.
* The reference client should remain intentionally small, understandable, and easy to extend.

## 5. Primary users

### Protocol implementer

A developer building a separate live audio application that needs to create, discover, join, and end Beachwave-compatible rooms without depending on the reference UI.

### Reference client user

A user who signs in with ATProto, creates or discovers a room, participates in live audio through LiveKit, and leaves or ends the room according to their role.

### Protocol maintainer

A contributor who evolves lexicons, SDK behavior, and documentation while preserving interoperability expectations.

## 6. Product requirements

### 6.1 Lexicons

The initial milestone must define `community.beachwave.room`.

The Room record must include:

* `title`: human-readable room title.
* `description`: optional room summary or agenda.
* `livekitRoom`: media transport room identifier.
* `status`: lifecycle state, initially `live` and eventually `ended`.
* `createdAt`: creation timestamp.
* `endedAt`: optional end timestamp.
* `hosts`: optional list of host DIDs allowed to administer the room.

Future lexicons may include Speaker, Invitation, Participant, Recording, Transcript, and Moderation Event records. These should be added only when their ownership, lifecycle, and interoperability expectations are documented.

### 6.2 SDK

The TypeScript SDK must expose a small stable API:

* `createRoom()` creates a live Room record.
* `endRoom()` marks a Room record as ended.
* `getRoom()` resolves a Room record by AT URI.
* `listRooms()` lists live Room records from one or more repositories.
* `joinRoom()` validates that a room is live and returns media connection metadata.
* `leaveRoom()` handles local session departure without mutating Room records until a Participant lexicon exists.

Applications should not need to understand raw repository operations to perform these operations.

### 6.3 Reference client

The browser client must demonstrate the protocol by consuming the SDK as a third-party application would.

The target feature set is:

* ATProto login.
* Room creation.
* Room discovery.
* LiveKit audio.
* Speaker requests.
* Host controls.
* Room lifecycle.

The current first milestone may use local adapters and mocked transport boundaries while the lexicon and SDK stabilize, but those seams must remain explicit.

### 6.4 Documentation

Documentation must describe protocol behavior independently of the reference implementation.

Every protocol object should explain:

* purpose;
* lifecycle;
* ownership;
* storage location;
* interoperability expectations.

A developer should be able to build a compatible client from the documentation without copying the reference application.

## 7. Functional flows

### 7.1 Create room

1. Authenticated host requests room creation.
2. Client validates user input.
3. SDK creates a `community.beachwave.room` record in the host repository.
4. Record stores metadata and LiveKit room identifier.
5. Discovering clients can list or resolve the record.

### 7.2 Discover room

1. Client selects repositories or feeds to inspect.
2. SDK lists `community.beachwave.room` records.
3. Client filters for `status: "live"`.
4. UI displays room metadata and host identity.

### 7.3 Join room

1. User selects a live Room record.
2. SDK resolves the record and rejects ended rooms.
3. Client uses the `livekitRoom` value and its LiveKit credentials to join media.
4. Participant state remains local until the Participant lexicon is introduced.

### 7.4 End room

1. Host requests room end.
2. SDK resolves the current Room record.
3. SDK updates the record to `status: "ended"` and sets `endedAt`.
4. Discovering clients stop presenting the room as joinable.

## 8. Interoperability requirements

* Clients must treat ATProto records as authoritative for room metadata and lifecycle state.
* Clients must not require reference-client-only fields to join or display rooms.
* Clients must preserve unknown compatible fields when updating records whenever possible.
* Ended rooms must not be presented as joinable.
* Media transport details must remain decoupled from ATProto storage.

## 9. Milestones

### Milestone 1: Protocol skeleton

* Define Room lexicon.
* Document protocol object semantics.
* Implement SDK room lifecycle helpers.
* Add a small reference client using the SDK.
* Add automated tests for create, list, join, and end flows.

### Milestone 2: Real ATProto integration

* Add a concrete ATProto repository adapter.
* Add ATProto login flow to the reference client.
* Confirm record creation, update, and discovery against a real PDS.

### Milestone 3: LiveKit media integration

* Add LiveKit token retrieval boundary.
* Join LiveKit audio rooms from resolved Room records.
* Document deployment expectations for the media service.

### Milestone 4: Moderated live audio

* Add speaker request flow.
* Add host controls.
* Evaluate Participant, Speaker, Invitation, and Moderation Event lexicons.

## 10. Success criteria

Beachwave succeeds when another developer can build a completely different live audio application that interoperates with the same ATProto room records without depending on the reference UI.
