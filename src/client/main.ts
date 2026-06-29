import {
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
  type MediaController,
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
  setStatus('Publishing room record…');
  try {
    await createRoom(account!.client, { title, description });
    setStatus('Room created.');
    await refreshRooms();
  } catch (error) {
    setStatus(describeError(error));
  }
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
    stage.innerHTML = `
      <div>
        <p class="eyebrow">Joined room</p>
        <h2 id="stage-title"></h2>
        <p class="muted-note">Role: <strong id="stage-role"></strong></p>
        <div id="stage-media"></div>
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
  const target = app!.querySelector<HTMLElement>('#stage-media')!;
  const canPublish = role === 'host' || role === 'speaker';

  if (!mediaController) {
    target.innerHTML = `
      <p class="muted-note">
        Media handoff target: <strong>${escapeHtml(livekitRoom)}</strong>.
        Configure a LiveKit token endpoint to connect audio in-app.
      </p>
    `;
    return;
  }

  target.innerHTML = '<p class="muted-note">Connecting audio…</p>';
  try {
    mediaSession = await mediaController.join({
      livekitRoom,
      identity: account!.did,
      displayName: account!.label,
      role
    });
    target.innerHTML = canPublish
      ? '<button id="mic" type="button">Mute microphone</button>'
      : '<p class="muted-note">Listening. Speaker invitations arrive here.</p>';
    if (canPublish) {
      let muted = false;
      const mic = target.querySelector<HTMLButtonElement>('#mic')!;
      mic.addEventListener('click', async () => {
        muted = !muted;
        await mediaSession!.setMicrophoneEnabled(!muted);
        mic.textContent = muted ? 'Unmute microphone' : 'Mute microphone';
      });
    }
  } catch (error) {
    target.innerHTML = `<p class="status">${escapeHtml(describeError(error))}</p>`;
  }
}

async function handleLeave(): Promise<void> {
  await leaveMedia();
  await leaveRoom();
  activeRoom = undefined;
  const stage = app!.querySelector<HTMLElement>('#stage')!;
  stage.innerHTML = `
    <div>
      <p class="eyebrow">Current session</p>
      <h2>No room joined</h2>
      <p>Create or join a room to start live audio.</p>
    </div>
  `;
}

async function leaveMedia(): Promise<void> {
  if (mediaSession) {
    try {
      await mediaSession.leave();
    } catch {
      // Best effort; the media session may already be gone.
    }
    mediaSession = undefined;
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
