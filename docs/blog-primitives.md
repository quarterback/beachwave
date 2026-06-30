title: The demo is the bait. The primitives are the point.
subtitle: Building Beachwave as a proof of concept that real builders can fork, adapt, and sign with their own name.

---

I built a live audio app on ATProto. You sign in with your handle, open a room, and the people who follow you watch it go live. The audio runs on LiveKit. It works, it's at beachwave.app, and you can join a room right now.

That's the demo. The demo is the bait.

The point is everything underneath it.

## Three primitives

Beachwave is built on three primitives, and once you see them as separate things, you can rebuild almost anything social on top of the same shape.

**Identity is yours.** You sign in with your existing ATProto account through OAuth. Every action runs against your own repository, signed by your own key. Beachwave borrows your identity for the length of a session and gives it back. There is no Beachwave account to create, because your account already exists and it belongs to you.

**Data is a record you own.** A room is a `community.beachwave.room` record sitting in your repository. It is public, portable, and readable by any client that understands the lexicon. The AT URI is printed right on the card, because a room is a thing you own and can point at, not a row in a database I control.

**Media is a swappable layer.** LiveKit handles the transport, the microphone, the speaking, the WebRTC. It sits behind a narrow boundary so the protocol never learns LiveKit's name and LiveKit never learns ATProto's. Swap the media layer and the records stay. Swap the client and the rooms stay.

Identity, data, media. Three clean seams. The app is what happens when you snap them together one particular way. Your app is what happens when you snap them together your way.

## The demo proves the stack. The repo is the deliverable.

A demo answers one question: does this work. Beachwave answers yes. You can hear it.

A reference implementation answers a better question: can someone else build their own version of this, with their own taste, their own rules, their own audience, and have it interoperate with mine on day one. That answer is also yes, and it is the entire reason the repo exists.

Everything in Beachwave is laid out to be lifted. The lexicon defines the data. The SDK owns the behavior. The media boundary is one file with a single job. The browser client consumes the SDK exactly the way a stranger's app would, because to the SDK, the reference client *is* a stranger's app. There is no privileged path. The example client earns its place by following the same rules everyone else gets.

When a room record says where its media lives, a room you create on your instance can be discovered and joined from mine. The protocol carries the interop end to end. The reference app is one client among many, and it is built to stay that way.

## Fork it and sign your name

Here is the part I care about most.

Fork Beachwave and you inherit working OAuth, real room records, live audio, moderation, discovery off the follow graph, and a deploy pattern that runs on a hobby tier. From there you make it yours. Change the moderation model. Rewrite the room lexicon for your own format. Point the media boundary at a different provider. Strip the chat, or make chat the whole thing. Build a client that looks nothing like mine over the exact same records.

I mirrored the whole thing to Tangled, which is git built on the same protocol, so even the source lives where the identity does. The proof of concept practices what it argues.

A platform asks you to move into its building and live by its rules. A primitive hands you the materials and gets out of your way. Beachwave is the second kind. The demo is there to make you feel it. The fork is there to make it yours.

Go take it apart. I want to see your fingerprints on it.

---

*Beachwave is open source under EPL-2.0. Code on GitHub at quarterback/beachwave, mirrored to Tangled at ronbronson.com/beachwave. A prototype made by ronbronson.dev. Built on ATProto and LiveKit.*
