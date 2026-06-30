import {
  addRoomHost,
  announceRoom,
  createRoom,
  discoverLiveRooms,
  endRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  listFollowDids,
  listRooms,
  removeRoomHost,
  touchRoom,
  ROOM_LIVE_TTL_MS,
  HttpMediaTokenProvider,
  LiveKitMediaController,
  OAuthClient,
  type BeachwaveRoom,
  type ChatMessage,
  type MediaParticipant,
  type MediaRoomState,
  type MediaSession,
  type ParticipantRole,
  type SpeakRequest
} from '../sdk/index.js';
import { resolveMediaTokenEndpoint, resolveOAuthConfig, resolveRemoveEndpoint, resolveSpeakGrantEndpoint } from './config.js';
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
const mediaController: LiveKitMediaController | undefined = mediaTokenEndpoint
  ? new LiveKitMediaController(new HttpMediaTokenProvider(mediaTokenEndpoint), {
      grantEndpoint: resolveSpeakGrantEndpoint(),
      removeEndpoint: resolveRemoveEndpoint()
    })
  : undefined;

const PENDING_ROOM_KEY = 'beachwave.pendingRoom';
const GITHUB_REPO_URL = 'https://github.com/quarterback/beachwave';

let account: Account | undefined;
let rooms: BeachwaveRoom[] = [];
let activeRoom: BeachwaveRoom | undefined;
let mediaSession: MediaSession | undefined;
let mediaUnsubscribers: Array<() => void> = [];
// Controller in use for the active room — local for your own rooms, or pointed
// at the host's deployment for a room discovered on another instance.
let activeController: LiveKitMediaController | undefined;

// Per-room speaker-moderation state, reset on each join/leave.
let micOn = false;
let speakRequested = false;
let controlMode: 'speaker' | 'listener' | undefined;
const pendingSpeakRequests = new Map<string, SpeakRequest>();

// Host heartbeat: keep the room's lastActiveAt fresh while we're hosting, so it
// doesn't linger as a ghost in discovery after the tab closes.
const HEARTBEAT_MS = Math.floor(ROOM_LIVE_TTL_MS / 2);
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

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
  const invited = Boolean(pendingSharedRoom());
  app!.innerHTML = `
    <div class="landing">
      <header class="lp-nav">
        <a class="lp-brand" href="#top"><img src="beachwave.svg" alt="" /><span>Beachwave</span></a>
        <nav class="lp-links">
          <a href="#signin">Sign in</a>
          <a class="lp-repo" href="${GITHUB_REPO_URL}" target="_blank" rel="noopener">GitHub repo ↗</a>
        </nav>
      </header>

      <section class="lp-hero" id="top">
        <div class="lp-hero-bg"></div>
        <div class="lp-hero-inner">
          <div class="lp-hero-copy">
            <div class="lp-pill"><span class="lp-pill-dot"><span></span></span>Live audio on the open protocol</div>
            <h1>Open the mic.<br /><span class="accent">Own the room.</span></h1>
            <div class="lp-cta">
              <a class="btn-lg" href="#signin"><img src="beachwave.svg" alt="" />Sign in with ATProto</a>
              <a class="btn-lg ghost" href="${GITHUB_REPO_URL}" target="_blank" rel="noopener">View the GitHub repo →</a>
            </div>
          </div>
          <div class="lp-preview">
            <div class="lp-card" aria-hidden="true">
              <div class="lp-card-top">
                <span class="live-badge"><span class="dot"></span>LIVE</span>
                <span class="lp-card-here">218 listening</span>
              </div>
              <div class="lp-card-title">Lexicon Lab: designing records</div>
              <div class="lp-card-host">hosted by maya.coastline.social</div>
              <div class="lp-card-avatars">
                <div class="a"><div class="avatar av-0 ring">MC</div><div class="nm">Maya</div></div>
                <div class="a"><div class="avatar av-1">JD</div><div class="nm">June</div></div>
                <div class="a"><div class="avatar muted">KS</div><div class="nm">Kai</div></div>
              </div>
              <div class="eq big">
                <span style="animation-delay:0s"></span><span style="animation-delay:.15s"></span>
                <span style="animation-delay:.32s"></span><span style="animation-delay:.5s"></span>
                <span style="animation-delay:.22s"></span><span style="animation-delay:.62s"></span>
                <span style="animation-delay:.4s"></span><span style="animation-delay:.08s"></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="signin" id="signin">
        ${invited ? '<div class="invite-banner">🎧 You followed a link to a live room — sign in with ATProto to join it.</div>' : ''}
        <div class="signin-card">
          <div class="signin-left panel-dark">
            <img class="signin-logo" src="beachwave.svg" alt="Beachwave" />
            <h2>Sign in with your<br />ATProto account.</h2>
          </div>
          <div class="signin-right">
            <form id="oauth-form">
              <label for="identifier">ATProto handle or DID</label>
              <div class="field">
                <span class="field-at mono">@</span>
                <input id="identifier" autocomplete="username" placeholder="alice.bsky.social" required />
              </div>
              <button type="submit" class="btn-block"><img src="beachwave.svg" alt="" style="width:20px;height:20px;border-radius:5px" />Continue with ATProto</button>
            </form>
            <div class="divider">DEVELOPER OPTIONS</div>
            <div class="dev-box">
              <p class="dev-note">App password &amp; offline demo are local-only fallbacks for development.</p>
              <form id="app-password-form" class="dev-form">
                <input id="ap-identifier" autocomplete="username" placeholder="handle or DID" />
                <input id="ap-password" type="password" autocomplete="current-password" placeholder="app password (xxxx-xxxx-xxxx-xxxx)" />
                <div class="dev-actions">
                  <button type="submit" class="chip">App password</button>
                  <button type="button" id="offline" class="chip">Offline demo</button>
                </div>
              </form>
            </div>
            <p class="status" id="status" role="status">${escapeHtml(message)}</p>
          </div>
        </div>
      </section>

      <div class="lp-footer-wrap">
        <div class="lp-footer-base"><span>Beachwave · open reference client</span><span>Built on ATProto + LiveKit</span><span>a prototype made by <a href="https://ronbronson.dev" target="_blank" rel="noopener">ronbronson.dev</a></span></div>
      </div>
    </div>
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

  if (invited) {
    app!.querySelector('#signin')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    app!.querySelector<HTMLInputElement>('#identifier')?.focus();
  }
}

// ---------------------------------------------------------------------------
// Signed-in application
// ---------------------------------------------------------------------------

async function renderApp(): Promise<void> {
  const current = account!;
  const modeBadge =
    current.kind === 'oauth' ? '' : `<span class="badge mode">${current.kind === 'offline' ? 'Offline demo' : 'Dev session'}</span>`;

  app!.innerHTML = `
    <main class="app">
      <header class="appbar">
        <a class="lp-brand" href="#" aria-label="Beachwave"><img src="beachwave.svg" alt="" /><span>Beachwave</span></a>
        <div class="appbar-right">
          ${modeBadge}
          <div class="appbar-id">
            <strong id="identity-label"></strong>
            <span class="mono" id="identity-pds"></span>
          </div>
          <a class="btn-sm ghost" href="${GITHUB_REPO_URL}" target="_blank" rel="noopener">GitHub repo ↗</a>
          <button id="sign-out" type="button" class="btn-sm secondary">Sign out</button>
        </div>
      </header>

      <section class="dash-head">
        <h1 id="welcome">Welcome back.</h1>
        <p>Start a room, or pick up where you left off.</p>
      </section>

      <section id="stage" class="stage" hidden></section>

      ${current.kind === 'offline' ? '' : `
      <section id="live-now" class="live-now" hidden>
        <div class="yr-head">
          <h3>Live now · from people you follow</h3>
          <button id="refresh-live" class="link-btn" type="button">Refresh</button>
        </div>
        <div id="live-rooms" class="room-list"></div>
      </section>`}

      <section class="dash-grid">
        <div class="create panel-dark">
          <div class="create-title">Start a room</div>
          <form id="room-form">
            <label for="title">Room title</label>
            <input id="title" class="field-gap" maxlength="120" required value="Office Hours" />
            <label for="description">Description</label>
            <textarea id="description" class="field-gap" maxlength="1000" rows="3">Open conversation for the community.</textarea>
            ${current.kind === 'offline' ? '' : `
            <label class="toggle">
              <input type="checkbox" id="announce" checked />
              <span class="track"></span>
              Share to my Bluesky feed
            </label>`}
            <button type="submit" class="btn-block"><span aria-hidden="true">🎙</span>Go live</button>
          </form>
          <p class="status" id="status" role="status"></p>
        </div>

        <div class="your-rooms">
          <div class="yr-head">
            <h3>Your rooms</h3>
            <button id="refresh" class="link-btn" type="button">Refresh</button>
          </div>
          <div id="rooms" class="room-list"></div>
          <section id="invite" hidden></section>
        </div>
      </section>
    </main>
  `;

  app!.querySelector<HTMLElement>('#identity-label')!.textContent = current.label;
  app!.querySelector<HTMLElement>('#identity-pds')!.textContent = current.pds ? new URL(current.pds).host : '';
  app!.querySelector<HTMLElement>('#welcome')!.textContent = `Welcome back, ${friendlyName(current.label)}.`;

  app!.querySelector<HTMLButtonElement>('#sign-out')!.addEventListener('click', handleSignOut);
  app!.querySelector<HTMLButtonElement>('#refresh')!.addEventListener('click', () => void refreshRooms());
  app!.querySelector<HTMLButtonElement>('#refresh-live')?.addEventListener('click', () => void refreshDiscover());
  app!.querySelector<HTMLFormElement>('#room-form')!.addEventListener('submit', handleCreate);

  await refreshRooms();
  await renderPendingSharedRoom();
  void refreshDiscover();
}

/** Populate the "Live now" lobby with live rooms from accounts the viewer follows. */
async function refreshDiscover(): Promise<void> {
  const current = account;
  if (!current || current.kind === 'offline') return;
  const section = app!.querySelector<HTMLElement>('#live-now');
  const list = app!.querySelector<HTMLElement>('#live-rooms');
  if (!section || !list) return;

  list.innerHTML = '<p class="empty">Looking for live rooms…</p>';
  section.hidden = false;
  try {
    const follows = await listFollowDids(current.did);
    if (follows.length === 0) {
      section.hidden = true;
      return;
    }
    const live = (await discoverLiveRooms(current.client, follows)).filter((room) => room.authorDid !== current.did);
    if (live.length === 0) {
      list.innerHTML = '<p class="empty">No one you follow is live right now.</p>';
      return;
    }
    list.replaceChildren(...live.map((room) => renderRoomCard(room, false)));
  } catch {
    // Discovery is best-effort; hide the lobby rather than show an error.
    section.hidden = true;
  }
}

async function handleCreate(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const title = app!.querySelector<HTMLInputElement>('#title')!.value;
  const description = app!.querySelector<HTMLTextAreaElement>('#description')!.value;
  const announce = app!.querySelector<HTMLInputElement>('#announce')?.checked ?? false;
  setStatus('Publishing room record…');
  try {
    const room = await createRoom(account!.client, { title, description, serviceEndpoint: window.location.origin });
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
  const description = room.record.description?.trim()
    || 'Live audio room on ATProto — tap to join the conversation.';
  await announceRoom(account!.client, {
    text: `${room.record.title} is live on Beachwave — join: ${url}`,
    url,
    // Carry a branded external-embed card so the post renders as a Beachwave
    // room on Bluesky instead of unfurling the generic site landing page.
    card: {
      title: `🎙 ${room.record.title} · live on Beachwave`,
      description
    }
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
  const ended = room.record.status === 'ended';

  const row = document.createElement('article');
  row.className = `room-row${ended ? ' ended' : ''}`;

  const main = document.createElement('div');
  main.className = 'room-row-main';

  const top = document.createElement('div');
  top.className = 'room-row-top';
  const badge = document.createElement('span');
  if (ended) {
    badge.className = 'pill-muted';
    badge.textContent = 'ENDED';
  } else {
    badge.className = 'pill-live';
    badge.innerHTML = '<span class="dot"></span>LIVE';
  }
  top.append(badge);

  const title = document.createElement('div');
  title.className = 'room-row-title';
  title.textContent = room.record.title;

  // The AT URI is shown deliberately — a room is just a record in your repo.
  const uri = document.createElement('div');
  uri.className = 'room-row-uri mono';
  uri.textContent = room.uri;

  main.append(top, title, uri);

  const actions = document.createElement('div');
  actions.className = 'room-row-actions';

  const joinButton = document.createElement('button');
  joinButton.type = 'button';
  joinButton.textContent = 'Join audio';
  joinButton.addEventListener('click', () => void handleJoin(room));

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'secondary';
  copyButton.textContent = 'Copy link';
  copyButton.addEventListener('click', () => void handleCopy(room));

  actions.append(joinButton, copyButton);

  if (account!.kind !== 'offline') {
    const shareButton = document.createElement('button');
    shareButton.type = 'button';
    shareButton.className = 'secondary';
    shareButton.textContent = 'Share';
    shareButton.addEventListener('click', () => void handleShare(room));
    actions.append(shareButton);
  }

  if (owned && canAdminister(room) && !ended) {
    const endButton = document.createElement('button');
    endButton.type = 'button';
    endButton.className = 'danger';
    endButton.textContent = 'End room';
    endButton.addEventListener('click', () => void handleEnd(room));
    actions.append(endButton);
  }

  row.append(main, actions);
  return row;
}

async function handleJoin(room: BeachwaveRoom): Promise<void> {
  try {
    const joined = await joinRoom(account!.client, room.uri);
    activeRoom = joined.room;
    const role = participantRole(joined.room);
    await leaveMedia();

    const stage = app!.querySelector<HTMLElement>('#stage')!;
    stage.hidden = false;
    stage.classList.add('active');
    stage.innerHTML = `
      <div class="room">
        <div class="room-main panel-dark">
          <div class="room-head">
            <div class="room-head-text">
              <div class="room-tags">
                <span class="live-badge"><span class="dot"></span>LIVE</span>
                <span class="eq"><span style="animation-delay:0s"></span><span style="animation-delay:.2s"></span><span style="animation-delay:.4s"></span><span style="animation-delay:.15s"></span></span>
              </div>
              <h2 id="stage-title"></h2>
              <div class="room-sub"><span id="stage-count">connecting…</span> · you joined as <strong id="stage-role"></strong></div>
            </div>
            <button id="copy-room" type="button" class="btn-sm ghost">Copy link</button>
          </div>
          <div class="room-section" id="requests-section" hidden>
            <div class="room-section-label">REQUESTS TO SPEAK</div>
            <div id="requests" class="request-list"></div>
          </div>
          <div class="room-section">
            <div class="room-section-label" id="speakers-label">SPEAKERS</div>
            <div id="speakers" class="speaker-grid"></div>
          </div>
          <div class="room-section" id="listeners-section" hidden>
            <div class="room-section-label" id="listeners-label">LISTENERS</div>
            <div id="listeners" class="listener-grid"></div>
          </div>
          <div id="audio-unlock" class="audio-unlock" hidden></div>
          <div class="room-controls">
            <div id="stage-media" class="room-controls-media"></div>
            <button id="leave" class="btn-leave" type="button">Leave</button>
          </div>
        </div>
        <aside class="room-chat panel-dark">
          <div class="chat-head"><span class="display">Room chat</span><span class="chat-sub">backed by LiveKit data</span></div>
          <div id="chat" class="chat" hidden>
            <ul id="chat-log" class="chat-log" aria-live="polite" aria-label="Room chat"></ul>
            <form id="chat-form" class="chat-form">
              <input id="chat-input" autocomplete="off" maxlength="500" placeholder="Message the room" aria-label="Message the room" />
              <button type="submit" class="chat-send" aria-label="Send">➤</button>
            </form>
          </div>
        </aside>
      </div>
    `;
    stage.querySelector('#stage-title')!.textContent = activeRoom.record.title;
    stage.querySelector('#stage-role')!.textContent = role;
    stage.querySelector('#leave')!.addEventListener('click', () => void handleLeave());
    stage.querySelector('#copy-room')!.addEventListener('click', () => void handleCopy(activeRoom!));
    stage.scrollIntoView({ behavior: 'smooth', block: 'start' });

    startHeartbeat(joined.room);
    await connectMedia(joined.livekitRoom, role);
  } catch (error) {
    setStatus(describeError(error));
  }
}

async function connectMedia(livekitRoom: string, role: ParticipantRole): Promise<void> {
  const media = app!.querySelector<HTMLElement>('#stage-media')!;
  const count = app!.querySelector<HTMLElement>('#stage-count')!;
  const controller = controllerFor(activeRoom);
  activeController = controller;

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

    // Reset per-room moderation state for this fresh session.
    controlMode = undefined;
    micOn = false;
    speakRequested = false;
    pendingSpeakRequests.clear();

    media.innerHTML = '';
    mediaUnsubscribers.push(mediaSession.subscribe(onRoomState));
    mediaUnsubscribers.push(mediaSession.onChat(appendChatMessage));
    mediaUnsubscribers.push(mediaSession.onSpeakRequest(handleSpeakRequest));
    mediaUnsubscribers.push(mediaSession.onSpeakDecision(handleSpeakDecision));
    mediaUnsubscribers.push(mediaSession.onRoleUpdate(handleRoleUpdate));
    setupChatForm();
    app!.querySelector<HTMLElement>('#chat')!.hidden = false;
  } catch (error) {
    count.textContent = '';
    media.innerHTML = `<p class="status">${escapeHtml(describeError(error))}</p>`;
  }
}

/**
 * Pick the media controller for a room. Your own rooms (and rooms hosted on this
 * deployment) use the local controller; a room discovered on another instance is
 * joined through the host's deployment, which holds that room's LiveKit project.
 */
function controllerFor(room: BeachwaveRoom | undefined): LiveKitMediaController | undefined {
  if (!room || account!.kind === 'offline') return undefined;
  const endpoint = room.record.serviceEndpoint;
  if (endpoint && !isSameOrigin(endpoint)) {
    const base = endpoint.replace(/\/+$/, '');
    return new LiveKitMediaController(new HttpMediaTokenProvider(`${base}/api/token`), {
      grantEndpoint: `${base}/api/grant-speak`,
      removeEndpoint: `${base}/api/remove-participant`
    });
  }
  return mediaController;
}

function isSameOrigin(url: string): boolean {
  try {
    return new URL(url).origin === window.location.origin;
  } catch {
    return true;
  }
}

function onRoomState(state: MediaRoomState): void {
  renderParticipants(state);
  updateAudioUnlock(state);
  renderControls(state);
}

/**
 * Render the bottom-row controls from current state. Idempotent by "mode" so the
 * frequent speaking-state updates don't rebuild the buttons — only a change in
 * publish permission (speaker ⇄ listener) swaps the controls.
 */
function renderControls(state: MediaRoomState): void {
  const media = app!.querySelector<HTMLElement>('#stage-media');
  if (!media) return;
  const local = state.participants.find((participant) => participant.isLocal);
  const mode: 'speaker' | 'listener' = local?.canSpeak ? 'speaker' : 'listener';
  if (mode === controlMode) return;
  controlMode = mode;
  media.replaceChildren(mode === 'speaker' ? buildMicControl() : buildRequestControl());
}

function buildMicControl(): HTMLElement {
  const mic = document.createElement('button');
  mic.type = 'button';
  mic.className = 'btn-mic';
  mic.textContent = micOn ? '🔇 Mute mic' : '🎙 Enable mic';
  const applyMic = async (want: boolean): Promise<void> => {
    try {
      await mediaSession!.setMicrophoneEnabled(want);
      micOn = want;
      mic.textContent = micOn ? '🔇 Mute mic' : '🎙 Unmute mic';
    } catch (error) {
      // On mobile the auto-attempt can be rejected; the next tap is a gesture.
      micOn = false;
      mic.textContent = '🎙 Enable mic';
      setStatus(describeError(error));
    }
  };
  mic.addEventListener('click', () => void applyMic(!micOn));
  // Auto-enable on desktop; mobile falls back to a tap on the button.
  if (!micOn) void applyMic(true);
  return mic;
}

function buildRequestControl(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'request-control';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn-mic ghost';
  const sync = (): void => {
    button.textContent = speakRequested ? '✋ Requested — waiting for host' : '✋ Request to speak';
    button.disabled = speakRequested;
  };
  button.addEventListener('click', async () => {
    if (speakRequested || !mediaSession) return;
    speakRequested = true;
    sync();
    try {
      await mediaSession.requestToSpeak();
      setStatus('Asked the host to speak.');
    } catch (error) {
      speakRequested = false;
      sync();
      setStatus(describeError(error));
    }
  });
  sync();
  wrap.append(button);
  return wrap;
}

/** Host side: a listener asked to speak. */
function handleSpeakRequest(request: SpeakRequest): void {
  if (!activeRoom || !canAdminister(activeRoom)) return;
  if (request.identity === account!.did) return;
  pendingSpeakRequests.set(request.identity, request);
  renderRequests();
}

/** Requester side: the host responded. */
function handleSpeakDecision(decision: { target: string; approved: boolean }): void {
  if (decision.target !== account!.did) return;
  if (decision.approved) {
    setStatus('You were approved to speak.');
  } else {
    speakRequested = false;
    setStatus('Your request to speak was declined.');
    if (mediaSession) renderControls(mediaSession.getState());
  }
}

/** Someone changed your room role; re-read the record so the UI reflects it. */
async function handleRoleUpdate(target: string): Promise<void> {
  if (target !== account!.did || !activeRoom) return;
  try {
    activeRoom = await getRoom(account!.client, activeRoom.uri);
    setStatus(canAdminister(activeRoom) ? 'You are now a room moderator.' : 'Your moderator role was removed.');
    if (mediaSession) onRoomState(mediaSession.getState());
  } catch {
    // Non-fatal; the role will be reflected on the next join.
  }
}

function renderRequests(): void {
  const section = app!.querySelector<HTMLElement>('#requests-section');
  const list = app!.querySelector<HTMLElement>('#requests');
  if (!section || !list) return;
  section.hidden = pendingSpeakRequests.size === 0;
  list.replaceChildren(...Array.from(pendingSpeakRequests.values()).map((request) => {
    const row = document.createElement('div');
    row.className = 'request-row';

    const name = document.createElement('span');
    name.className = 'request-name';
    name.textContent = request.name || shortDid(request.identity);

    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'btn-sm';
    approve.textContent = 'Approve';
    approve.addEventListener('click', () => void decideRequest(request, true));

    const deny = document.createElement('button');
    deny.type = 'button';
    deny.className = 'btn-sm ghost';
    deny.textContent = 'Deny';
    deny.addEventListener('click', () => void decideRequest(request, false));

    row.append(name, approve, deny);
    return row;
  }));
}

async function decideRequest(request: SpeakRequest, approved: boolean): Promise<void> {
  pendingSpeakRequests.delete(request.identity);
  renderRequests();
  try {
    if (approved) {
      await activeController!.grantSpeaker({ livekitRoom: activeRoom!.record.livekitRoom, identity: request.identity });
    }
    await mediaSession!.decideSpeak(request.identity, approved);
    setStatus(approved ? `Approved ${request.name || 'guest'} to speak.` : 'Request declined.');
  } catch (error) {
    setStatus(describeError(error));
  }
}

/** Show a tap-to-enable-audio control when the browser blocks playback (mobile/iOS). */
function updateAudioUnlock(state: MediaRoomState): void {
  const banner = app!.querySelector<HTMLElement>('#audio-unlock');
  if (!banner) return;
  if (!state.audioBlocked) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  if (banner.childElementCount === 0) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Tap to enable audio';
    button.addEventListener('click', async () => {
      try {
        await mediaSession?.startAudio();
      } catch (error) {
        setStatus(describeError(error));
      }
    });
    banner.append(button);
  }
}

function renderParticipants(state: MediaRoomState): void {
  const speakersEl = app!.querySelector<HTMLElement>('#speakers');
  const listenersEl = app!.querySelector<HTMLElement>('#listeners');
  const count = app!.querySelector<HTMLElement>('#stage-count');
  if (!speakersEl || !listenersEl || !count) return;

  const speakers = state.participants.filter((p) => p.canSpeak);
  const listeners = state.participants.filter((p) => !p.canSpeak);
  const total = state.participants.length;
  count.textContent = `${total} ${total === 1 ? 'person' : 'people'} here`;

  const speakersLabel = app!.querySelector<HTMLElement>('#speakers-label');
  if (speakersLabel) speakersLabel.textContent = `SPEAKERS · ${speakers.length}`;
  speakersEl.replaceChildren(...speakers.map((participant, index) => {
    const item = document.createElement('div');
    item.className = `speaker${participant.isSpeaking ? ' speaking' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = `avatar av-${index % 4}${participant.isSpeaking ? ' ring' : ''}`;
    avatar.textContent = initials(participant.name || participant.identity);

    const name = document.createElement('div');
    name.className = 'speaker-name';
    name.textContent = participant.name || shortDid(participant.identity);

    const role = document.createElement('div');
    role.className = `speaker-role${participant.isSpeaking ? ' live' : ''}`;
    role.textContent = roleLabel(participant);

    item.append(avatar, name, role);
    const actions = hostActions(participant, true);
    if (actions) item.append(actions);
    return item;
  }));

  const section = app!.querySelector<HTMLElement>('#listeners-section');
  const listenersLabel = app!.querySelector<HTMLElement>('#listeners-label');
  if (section) section.hidden = listeners.length === 0;
  if (listenersLabel) listenersLabel.textContent = `LISTENERS · ${listeners.length}`;
  listenersEl.replaceChildren(...listeners.map((participant) => {
    const item = document.createElement('div');
    item.className = 'listener';

    const avatar = document.createElement('div');
    avatar.className = 'avatar muted';
    avatar.textContent = initials(participant.name || participant.identity);

    const name = document.createElement('div');
    name.className = 'listener-name';
    name.textContent = participant.name || shortDid(participant.identity);

    item.append(avatar, name);
    const badge = listenerBadge(participant);
    if (badge) {
      const roleEl = document.createElement('div');
      roleEl.className = 'speaker-role';
      roleEl.textContent = badge;
      item.append(roleEl);
    }
    const actions = hostActions(participant, false);
    if (actions) item.append(actions);
    return item;
  }));
}

/** Role text for a speaker card. */
function roleLabel(participant: MediaParticipant): string {
  if (participant.isSpeaking) return 'speaking';
  if (activeRoom && participant.identity === activeRoom.authorDid) return 'host';
  if (isModerator(participant.identity)) return 'moderator';
  return participant.isLocal ? 'you' : 'speaker';
}

/** Role text for a listener card, shown only for notable roles. */
function listenerBadge(participant: MediaParticipant): string {
  if (activeRoom && participant.identity === activeRoom.authorDid) return 'host';
  if (isModerator(participant.identity)) return 'moderator';
  return participant.isLocal ? 'you' : '';
}

function isRoomOwner(room: BeachwaveRoom): boolean {
  return room.authorDid === account!.did;
}

function isModerator(did: string): boolean {
  return !!activeRoom && did !== activeRoom.authorDid && (activeRoom.record.hosts ?? []).includes(did);
}

/** Host-only moderation buttons for a remote participant (null otherwise). */
function hostActions(participant: MediaParticipant, isSpeaker: boolean): HTMLElement | null {
  if (participant.isLocal || account!.kind === 'offline' || !activeController) return null;
  if (!activeRoom || !canAdminister(activeRoom)) return null;

  const wrap = document.createElement('div');
  wrap.className = 'host-actions';
  wrap.append(
    isSpeaker
      ? actionButton('Move to audience', () => moderate('demote', participant))
      : actionButton('Invite', () => moderate('invite', participant))
  );
  // Promoting a co-moderator writes the room record, so only the owner can do it.
  if (isRoomOwner(activeRoom) && participant.identity !== activeRoom.authorDid) {
    wrap.append(
      isModerator(participant.identity)
        ? actionButton('Remove mod', () => moderate('demote-mod', participant))
        : actionButton('Make mod', () => moderate('promote-mod', participant))
    );
  }
  wrap.append(actionButton('Remove', () => moderate('remove', participant), true));
  return wrap;
}

function actionButton(label: string, onClick: () => void, danger = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `mod-btn${danger ? ' danger' : ''}`;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

async function moderate(
  action: 'invite' | 'demote' | 'remove' | 'promote-mod' | 'demote-mod',
  participant: MediaParticipant
): Promise<void> {
  if (!activeController || !activeRoom) return;
  const livekitRoom = activeRoom.record.livekitRoom;
  const who = participant.name || shortDid(participant.identity);
  try {
    if (action === 'invite') {
      await activeController.grantSpeaker({ livekitRoom, identity: participant.identity, canPublish: true });
      await mediaSession?.decideSpeak(participant.identity, true);
      setStatus(`Invited ${who} to speak.`);
    } else if (action === 'demote') {
      await activeController.grantSpeaker({ livekitRoom, identity: participant.identity, canPublish: false });
      setStatus(`Moved ${who} to the audience.`);
    } else if (action === 'remove') {
      await activeController.removeParticipant({ livekitRoom, identity: participant.identity });
      setStatus(`Removed ${who}.`);
    } else if (action === 'promote-mod') {
      activeRoom = await addRoomHost(account!.client, activeRoom.uri, participant.identity);
      await mediaSession?.notifyRoleUpdate(participant.identity);
      setStatus(`Made ${who} a moderator.`);
      if (mediaSession) onRoomState(mediaSession.getState());
    } else if (action === 'demote-mod') {
      activeRoom = await removeRoomHost(account!.client, activeRoom.uri, participant.identity);
      await mediaSession?.notifyRoleUpdate(participant.identity);
      setStatus(`Removed ${who} as moderator.`);
      if (mediaSession) onRoomState(mediaSession.getState());
    }
  } catch (error) {
    setStatus(describeError(error));
  }
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

/** Two-letter avatar initials from a display name or handle/DID. */
function initials(value: string): string {
  const cleaned = value.replace(/^@/, '').replace(/^did:[a-z]+:/, '').trim();
  const parts = cleaned.split(/[\s._@:-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase() || '··';
}

/** First label of a handle, capitalized — for the dashboard greeting. */
function friendlyName(label: string): string {
  const first = label.replace(/^@/, '').split(/[.\s@]/)[0] || label;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

async function handleLeave(): Promise<void> {
  stopHeartbeat();
  await leaveMedia();
  await leaveRoom();
  activeRoom = undefined;
  controlMode = undefined;
  micOn = false;
  speakRequested = false;
  pendingSpeakRequests.clear();
  const stage = app!.querySelector<HTMLElement>('#stage')!;
  stage.classList.remove('active');
  stage.innerHTML = '';
  stage.hidden = true;
}

/** Keep the room's heartbeat fresh while we host it (so discovery stays honest). */
function startHeartbeat(room: BeachwaveRoom): void {
  stopHeartbeat();
  if (account!.kind === 'offline' || !canAdminister(room)) return;
  heartbeatTimer = setInterval(() => {
    void touchRoom(account!.client, room.uri).catch(() => {});
  }, HEARTBEAT_MS);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }
}

async function leaveMedia(): Promise<void> {
  for (const unsubscribe of mediaUnsubscribers) unsubscribe();
  mediaUnsubscribers = [];
  activeController = undefined;
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
  stopHeartbeat();
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
  section.hidden = true;
  if (!uri) return;
  // A shared link should land you in the room, not on the dashboard. Resolve the
  // record the link points at and open the live room directly.
  try {
    const room = await getRoom(account!.client, uri);
    forgetSharedRoom();
    await handleJoin(room);
  } catch (error) {
    forgetSharedRoom();
    setStatus(`Couldn't open the shared room: ${describeError(error)}`);
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
