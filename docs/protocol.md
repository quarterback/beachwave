# Beachwave Protocol

Beachwave uses ATProto repositories as the source of identity and room metadata. Media bytes are not stored in ATProto; live audio is transported by LiveKit or any compatible media layer that clients agree to join from the room metadata.

## Identity and authentication

Identity comes from ATProto. Clients authenticate the acting user with ATProto OAuth and act on that user's repository through their own PDS. The acting DID is the room owner and the authority for room records they create.

* Handles and DIDs are resolved independently of any single PDS (handle → DID → DID document → PDS endpoint), so a client can authenticate accounts on any host.
* Access tokens are sender-constrained with DPoP; every repository write is a DPoP-bound XRPC call to the owner's PDS.
* App-password authentication is permitted only as a development fallback and is not part of the recommended client behavior.

See `docs/auth.md` for the full OAuth implementation. Authentication is a client/SDK concern, not a record schema; lexicons describe data only.

## Room record

* **Lexicon:** `community.beachwave.room`
* **Storage:** host user's ATProto repository collection `community.beachwave.room`
* **Owner:** the DID that creates the record; additional host DIDs may be listed in `hosts`
* **Purpose:** advertise a live audio room and provide the LiveKit room name needed to join media
* **Lifecycle:** created with `status: "live"`, updated to `status: "ended"` with `endedAt` when closed
* **Interoperability:** clients should treat ATProto as authoritative for title, lifecycle state, host identity, and discovery; clients should not require reference-client-specific fields

Required fields are `title`, `livekitRoom`, `createdAt`, and `status`. Optional fields include `description`, `endedAt`, and `hosts`.

## SDK contract

Compatible clients can use raw repository operations or the SDK functions:

* `createRoom()` creates a Room record in the signed-in user's repository.
* `endRoom()` marks a Room record as ended.
* `getRoom()` resolves a Room record by AT URI.
* `listRooms()` lists discoverable live Room records for configured repositories.
* `joinRoom()` returns media connection information for a room.
* `leaveRoom()` is a local media-session operation and does not mutate the Room record.

## Reference client boundaries

The browser client demonstrates one possible UI. It intentionally consumes the SDK instead of embedding repository operations so protocol behavior remains independent from the reference application.
