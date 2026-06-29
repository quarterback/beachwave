import {
  announceRoom,
  createRoom,
  endRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  listRooms,
  HttpMediaTokenProvider,
  LiveKitMediaController,
  OAuthClient,
  type BeachwaveRoom,
  type ChatMessage,
  type MediaController,
  type MediaRoomState,
  type MediaSession,
  type ParticipantRole
} from '../sdk/index.js';
import { resolveMediaTokenEndpoint, resolveOAuthConfig } from './config.js';
import {
  completeOAuthCallback,
  restoreAccount,
  signInWithAppPassword,
  startOAuthSignIn,
  startOfflineDemo,
  type Account
} from './account.js';

const app = document.querySelector<HTMLDivElement>('#root');
if (!app) throw new Error('Missing #root element');

const oauth = new OAuthClient(resolveOAuthConfig());
const mediaTokenEndpoint = resolveMediaTokenEndpoint();
const mediaController: MediaController | undefined = mediaTokenEndpoint
  ? new LiveKitMediaController(new HttpMediaTokenProvider(mediaTokenEndpoint))
  : undefined;

const PENDING_ROOM_KEY = 'beachwave.pendingRoom';

let account: Account | undefined;
let rooms: BeachwaveRoom[] = [];
let activeRoom: BeachwaveRoom | undefined;
let mediaSession: MediaSession | undefined;
let mediaUnsubscribers: Array<() => void> = [];

void boot();

async function boot(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  rememberSharedRoom(params.get('room'));

  try {
    if (OAuthClient.isCallback(params)) {
      account = await completeOAuthCallback(oauth, params);
      clearCallbackParams();
    } else {
      account = await restoreAccount(oauth);
    }
  } catch (error) {
    renderSignIn(describeError(error));
    return;
  }

  if (account) {
    await renderApp();
  } else {
    renderSignIn();
  }
}

// ---------------------------------------------------------------------------
// Sign-in screen
// ---------------------------------------------------------------------------

function renderSignIn(message = ''): void {
  app!.innerHTML = `
    <main class="shell">
      <section class="hero">
        <div class="card hero-card">
          <div class="brand-lockup" aria-label="Beachwave">
            <img src="beachwave.svg" alt="" />
            <span>Beachwave</span>
          </div>
          <p class="eyebrow">Live audio on ATProto</p>
          <h1 data-brand>Beachwave</h1>
          <p>
            Sign in with your ATProto account to create live audio rooms, share a
            link, and hand off to LiveKit for the conversation. Identity and room
            metadata stay in your repository.
          </p>
        </div>
        <aside class="card stage">
          <div>
            <p class="eyebrow">Sign in</p>
            <form id="oauth-form" class="form-grid">
              <label>
                ATProto handle or DID
                <input id="identifier" autocomplete="username" placeholder="alice.bsky.social" required />
              </label>
              <div class="actions">
                <button type="submit">Sign in with ATProto</button>
              </div>
            </form>
            <p class="status" id="status" role="status">${escapeHtml(message)}</p>
          </div>
        </aside>
      </section>

      <section class="card">
        <details>
          <summary>Developer options</summary>
          <p class="muted-note">
            OAuth is the recommended flow. These fallbacks exist for local
            development before a client metadata document is hosted.
          </p>
          <form id="app-password-form" class="form-grid">
            <label>
              Handle or DID
              <input id="ap-identifier" autocomplete="username" placeholder="alice.bsky.social" />
            </label>
            <label>
              App password
              <input id="ap-password" type="password" autocomplete="current-password" placeholder="xxxx-xxxx-xxxx-xxxx" />
            </label>
            <div class="actions">
              <button type="submit" class="secondary">Sign in with app password</button>
              <button type="button" id="offline" class="secondary">Continue with offline demo</button>
            </div>
          </form>
        </details>
      </section>
    </main>
  `;

  const status = app!.querySelector<HTMLElement>('#status')!;

  app!.querySelector<HTMLFormElement>('#oauth-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const identifier = app!.querySelector<HTMLInputElement>('#identifier')!.value.trim();
    if (!identifier) return;
    status.textContent = 'Redirecting to your ATProto authorization server…';
    try {
      await startOAuthSignIn(oauth, identifier);
    } catch (error) {
      status.textContent = describeError(error);
    }
  });

  app!.querySelector<HTMLFormElement>('#app-password-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const identifier = app!.querySelector<HTMLInputElement>('#ap-identifier')!.value.trim();
    const password = app!.querySelector<HTMLInputElement>('#ap-password')!.value;
    if (!identifier || !password) {
      status.textContent = 'Enter a handle and app password.';
      return;
    }
    status.textContent = 'Signing in…';
    try {
      account = await signInWithAppPassword(identifier, password);
      await renderApp();
    } catch (error) {
      status.textContent = describeError(error);
    }
  });

  app!.querySelector<HTMLButtonElement>('#offline')!.addEventListener('click', async () => {
    account = startOfflineDemo();
    await renderApp();
  });
}

// ---------------------------------------------------------------------------
// Signed-in application
// ---------------------------------------------------------------------------

async function renderApp(): Promise<void> {
  const current = account!;
  const modeBadge =
    current.kind === 'oauth' ? '' : `<span class="badge mode">${current.kind === 'offline' ? 'Offline demo' : 'Dev session'}</span>`;

  app!.innerHTML = `
    <main class="shell">
      <header class="topbar card">
        <div class="brand-lockup" aria-label="Beachwave">
          <img src="beachwave.svg" alt="" />
          <span>Beachwave</span>
        </div>
        <div class="identity">
          ${modeBadge}
          <div>
            <strong id="identity-label"></strong>
            <span class="muted-note" id="identity-pds"></span>
          </div>
          <button id="sign-out" type="button" class="secondary">Sign out</button>
        </div>
      </header>

      <section class="hero">
        <div class="card">
          <h2>Create a room</h2>
          <form id="room-form" class="form-grid">
            <label>
              Room title
              <input id="title" maxlength="120" required value="Office Hours" />
            </label>
            <label>
              Description
              <textarea id="description" maxlength="1000" rows="3">Open conversation for the community.</textarea>
            </label>
            ${current.kind === 'offline' ? '' : `
            <label class="checkbox">
              <input type="checkbox" id="announce" checked />
              Share to my Bluesky feed
            </label>`}
            <div class="actions">
              <button type="submit">Create room</button>
              <span class="status" id="status" role="status"></span>
            </div>
          </form>
        </div>
        <aside class="card stage" id="stage">
          <div>
            <p class="eyebrow">Current session</p>
            <h2>No room joined</h2>
            <p>Create or join a room to start live audio.</p>
          </div>
        </aside>
      </section>

      <section id="invite" hidden></section>

      <section class="card">
        <div class="actions section-head">
          <h2>Your live rooms</h2>
          <button id="refresh" class="secondary" type="button">Refresh</button>
        </div>
        <div id="rooms" class="room-grid"></div>
      </section>
    </main>
  `;

  app!.querySelector<HTMLElement>('#identity-label')!.textContent = current.label;
  app!.querySelector<HTMLElement>('#identity-pds')!.textContent = current.pds ? new URL(current.pds).host : '';

  app!.querySelector<HTMLButtonElement>('#sign-out')!.addEventListener('click', handleSignOut);
  app!.querySelector<HTMLButtonElement>('#refresh')!.addEventListener('click', () => void refreshRooms());
  app!.querySelector<HTMLFormElement>('#room-form')!.addEventListener('submit', handleCreate);

  await refreshRooms();
  await renderPendingSharedRoom();
}

async function handleCreate(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const title = app!.querySelector<HTMLInputElement>('#title')!.value;
  const description = app!.querySelector<HTMLTextAreaElement>('#description')!.value;
  const announce = app!.querySelector<HTMLInputElement>('#announce')?.checked ?? false;
  setStatus('Publishing room record…');
  try {
    const room = await createRoom(account!.client, { title, description });
    await refreshRooms();
    if (announce) {
      setStatus('Room created. Sharing to Bluesky…');
      try {
        await shareRoom(room);
        setStatus('Room created and shared to your Bluesky feed.');
      } catch (error) {
        setStatus(`Room created. Sharing to Bluesky failed: ${describeError(error)}`);
      }
    } else {
      setStatus('Room created.');
    }
  } catch (error) {
    setStatus(describeError(error));
  }
}

async function shareRoom(room: BeachwaveRoom): Promise<void> {
  const url = roomUrl(room);
  await announceRoom(account!.client, {
    text: `${room.record.title} is live on Beachwave — join: ${url}`,
    url
  });
}

async function refreshRooms(): Promise<void> {
  try {
    rooms = await listRooms(account!.client);
    renderRooms();
  } catch (error) {
    setStatus(describeError(error));
  }
}

function renderRooms(): void {
  const container = app!.querySelector<HTMLDivElement>('#rooms')!;
  if (rooms.length === 0) {
    container.innerHTML = '<p class="empty">No live rooms yet. Create one to get started.</p>';
    return;
  }
  container.replaceChildren(...rooms.map((room) => renderRoomCard(room, true)));
}

function renderRoomCard(room: BeachwaveRoom, owned: boolean): HTMLElement {
  const article = document.createElement('article');
  article.className = 'card room';

  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = '● Live';

  const title = document.createElement('h3');
  title.textContent = room.record.title;

  const description = document.createElement('p');
  description.textContent = room.record.description ?? 'No description provided.';

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `
    <span><strong>AT URI</strong> <code></code></span>
    <span><strong>Media room</strong> <code></code></span>
    <span><strong>Host</strong> <code></code></span>
  `;
  const codes = meta.querySelectorAll('code');
  codes[0].textContent = room.uri;
  codes[1].textContent = room.record.livekitRoom;
  codes[2].textContent = room.authorDid;

  const actions = document.createElement('div');
  actions.className = 'actions';

  const joinButton = document.createElement('button');
  joinButton.type = 'button';
  joinButton.textContent = 'Join audio';
  joinButton.addEventListener('click', () => void handleJoin(room));

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'secondary';
  copyButton.textContent = 'Copy room link';
  copyButton.addEventListener('click', () => void handleCopy(room));

  actions.append(joinButton, copyButton);

  if (account!.kind !== 'offline') {
    const shareButton = document.createElement('button');
    shareButton.type = 'button';
    shareButton.className = 'secondary';
    shareButton.textContent = 'Share to Bluesky';
    shareButton.addEventListener('click', () => void handleShare(room));
    actions.append(shareButton);
  }

  if (owned && canAdminister(room)) {
    const endButton = document.createElement('button');
    endButton.type = 'button';
    endButton.className = 'danger';
    endButton.textContent = 'End room';
    endButton.addEventListener('click', () => void handleEnd(room));
    actions.append(endButton);
  }

  article.append(badge, title, description, meta, actions);
  return article;
}

async function handleJoin(room: BeachwaveRoom): Promise<void> {
  try {
    const joined = await joinRoom(account!.client, room.uri);
    activeRoom = joined.room;
    const role = participantRole(joined.room);
    await leaveMedia();

    const stage = app!.querySelector<HTMLElement>('#stage')!;
    stage.classList.add('active');
    stage.innerHTML = `
      <div class="joined">
        <p class="eyebrow">Joined room</p>
        <h2 id="stage-title"></h2>
        <p class="muted-note">Role: <strong id="stage-role"></strong> · <span id="stage-count">connecting…</span></p>
        <ul id="participants" class="participants"></ul>
        <div id="stage-media" class="actions"></div>
        <div id="chat" class="chat" hidden>
          <ul id="chat-log" class="chat-log" aria-live="polite" aria-label="Room chat"></ul>
          <form id="chat-form" class="chat-form">
            <input id="chat-input" autocomplete="off" maxlength="500" placeholder="Message the room" aria-label="Message the room" />
            <button type="submit">Send</button>
          </form>
        </div>
        <button id="leave" class="secondary" type="button">Leave room</button>
      </div>
    `;
    stage.querySelector('#stage-title')!.textContent = activeRoom.record.title;
    stage.querySelector('#stage-role')!.textContent = role;
    stage.querySelector('#leave')!.addEventListener('click', () => void handleLeave());

    await connectMedia(joined.livekitRoom, role);
  } catch (error) {
    setStatus(describeError(error));
  }
}

async function connectMedia(livekitRoom: string, role: ParticipantRole): Promise<void> {
  const media = app!.querySelector<HTMLElement>('#stage-media')!;
  const count = app!.querySelector<HTMLElement>('#stage-count')!;
  const canPublish = role === 'host' || role === 'speaker';
  // The offline demo is local-only; it never connects to a real media server.
  const controller = account!.kind === 'offline' ? undefined : mediaController;

  if (!controller) {
    count.textContent = 'audio not configured';
    media.innerHTML = `
      <p class="muted-note">
        Media handoff target: <strong>${escapeHtml(livekitRoom)}</strong>.
        Configure a LiveKit token endpoint to connect audio and chat in-app.
      </p>
    `;
    return;
  }

  media.innerHTML = '<p class="muted-note">Connecting…</p>';
  try {
    mediaSession = await controller.join({
      livekitRoom,
      identity: account!.did,
      displayName: account!.label,
      role
    });

    media.innerHTML = '';
    if (canPublish) {
      const mic = document.createElement('button');
      mic.type = 'button';
      mic.textContent = 'Mute microphone';
      let muted = false;
      mic.addEventListener('click', async () => {
        muted = !muted;
        await mediaSession!.setMicrophoneEnabled(!muted);
        mic.textContent = muted ? 'Unmute microphone' : 'Mute microphone';
      });
      media.append(mic);
    } else {
      const note = document.createElement('p');
      note.className = 'muted-note';
      note.textContent = 'Listening. Use chat to take part.';
      media.append(note);
    }

    mediaUnsubscribers.push(mediaSession.subscribe(renderParticipants));
    mediaUnsubscribers.push(mediaSession.onChat(appendChatMessage));
    setupChatForm();
    app!.querySelector<HTMLElement>('#chat')!.hidden = false;
  } catch (error) {
    count.textContent = '';
    media.innerHTML = `<p class="status">${escapeHtml(describeError(error))}</p>`;
  }
}

function renderParticipants(state: MediaRoomState): void {
  const list = app!.querySelector<HTMLUListElement>('#participants');
  const count = app!.querySelector<HTMLElement>('#stage-count');
  if (!list || !count) return;

  count.textContent = `${state.participants.length} ${state.participants.length === 1 ? 'person' : 'people'} here`;
  list.replaceChildren(...state.participants.map((participant) => {
    const item = document.createElement('li');
    item.className = `participant${participant.isSpeaking ? ' speaking' : ''}`;

    const dot = document.createElement('span');
    dot.className = 'speaking-dot';
    dot.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'participant-name';
    name.textContent = participant.name || shortDid(participant.identity);

    const tag = document.createElement('span');
    tag.className = 'participant-tag';
    if (participant.isLocal) tag.textContent = 'you';
    else if (!participant.canSpeak) tag.textContent = 'listener';
    else if (participant.isSpeaking) tag.textContent = 'speaking';

    item.append(dot, name, tag);
    return item;
  }));
}

function setupChatForm(): void {
  const form = app!.querySelector<HTMLFormElement>('#chat-form');
  const input = app!.querySelector<HTMLInputElement>('#chat-input');
  if (!form || !input) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !mediaSession) return;
    input.value = '';
    try {
      await mediaSession.sendChat(text);
    } catch (error) {
      setStatus(describeError(error));
    }
  });
}

function appendChatMessage(message: ChatMessage): void {
  const log = app!.querySelector<HTMLUListElement>('#chat-log');
  if (!log) return;
  const item = document.createElement('li');
  item.className = `chat-message${message.isLocal ? ' mine' : ''}`;

  const who = document.createElement('strong');
  who.textContent = message.name || shortDid(message.from);

  const body = document.createElement('span');
  body.textContent = message.text;

  item.append(who, body);
  log.append(item);
  log.scrollTop = log.scrollHeight;
}

function shortDid(did: string): string {
  return did.length > 16 ? `${did.slice(0, 12)}…${did.slice(-4)}` : did;
}

async function handleLeave(): Promise<void> {
  await leaveMedia();
  await leaveRoom();
  activeRoom = undefined;
  const stage = app!.querySelector<HTMLElement>('#stage')!;
  stage.classList.remove('active');
  stage.innerHTML = `
    <div>
      <p class="eyebrow">Current session</p>
      <h2>No room joined</h2>
      <p>Create or join a room to start live audio.</p>
    </div>
  `;
}

async function leaveMedia(): Promise<void> {
  for (const unsubscribe of mediaUnsubscribers) unsubscribe();
  mediaUnsubscribers = [];
  if (mediaSession) {
    try {
      await mediaSession.leave();
    } catch {
      // Best effort; the media session may already be gone.
    }
    mediaSession = undefined;
  }
}

async function handleShare(room: BeachwaveRoom): Promise<void> {
  setStatus('Sharing to Bluesky…');
  try {
    await shareRoom(room);
    setStatus('Shared to your Bluesky feed.');
  } catch (error) {
    setStatus(describeError(error));
  }
}

async function handleCopy(room: BeachwaveRoom): Promise<void> {
  try {
    await navigator.clipboard.writeText(roomUrl(room));
    setStatus('Copied room link.');
  } catch {
    setStatus(roomUrl(room));
  }
}

async function handleEnd(room: BeachwaveRoom): Promise<void> {
  try {
    await endRoom(account!.client, room.uri);
    if (activeRoom?.uri === room.uri) await handleLeave();
    setStatus('Room ended.');
    await refreshRooms();
  } catch (error) {
    setStatus(describeError(error));
  }
}

async function handleSignOut(): Promise<void> {
  await leaveMedia();
  await account?.signOut();
  account = undefined;
  activeRoom = undefined;
  rooms = [];
  forgetSharedRoom();
  renderSignIn();
}

// ---------------------------------------------------------------------------
// Shared-room (invite link) handling
// ---------------------------------------------------------------------------

async function renderPendingSharedRoom(): Promise<void> {
  const uri = pendingSharedRoom();
  const section = app!.querySelector<HTMLElement>('#invite')!;
  if (!uri || rooms.some((room) => room.uri === uri)) {
    section.hidden = true;
    return;
  }
  try {
    const room = await getRoom(account!.client, uri);
    forgetSharedRoom();
    section.hidden = false;
    section.className = 'card';
    section.innerHTML = '<p class="eyebrow">You were invited</p>';
    section.append(renderRoomCard(room, room.authorDid === account!.did));
  } catch {
    section.hidden = true;
  }
}

function rememberSharedRoom(uri: string | null): void {
  if (uri && uri.startsWith('at://')) sessionStorage.setItem(PENDING_ROOM_KEY, uri);
}

function pendingSharedRoom(): string | undefined {
  return sessionStorage.getItem(PENDING_ROOM_KEY) ?? undefined;
}

function forgetSharedRoom(): void {
  sessionStorage.removeItem(PENDING_ROOM_KEY);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function participantRole(room: BeachwaveRoom): ParticipantRole {
  return canAdminister(room) ? 'host' : 'listener';
}

function canAdminister(room: BeachwaveRoom): boolean {
  if (room.authorDid === account!.did) return true;
  return (room.record.hosts ?? []).includes(account!.did);
}

function roomUrl(room: BeachwaveRoom): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('room', room.uri);
  return url.toString();
}

function setStatus(message: string): void {
  const status = app!.querySelector<HTMLElement>('#status');
  if (status) status.textContent = message;
}

function clearCallbackParams(): void {
  const url = new URL(window.location.href);
  url.search = '';
  window.history.replaceState({}, '', url.toString());
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
