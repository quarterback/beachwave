import { createRoom, endRoom, joinRoom, leaveRoom, listRooms, type BeachwaveRoom } from '../sdk/index.js';
import { BrowserRepositoryClient } from './browser-repository.js';

const app = document.querySelector<HTMLDivElement>('#root');
if (!app) throw new Error('Missing #root element');

const client = new BrowserRepositoryClient('did:web:ronbronson.dev');
let rooms: BeachwaveRoom[] = [];
let activeRoom: BeachwaveRoom | undefined;

app.innerHTML = `
  <main class="shell">
    <section class="hero">
      <div class="card">
        <p class="eyebrow">ATProto live audio proof of concept</p>
        <h1 data-brand>Beachwave</h1>
        <p>
          Create a live audio room record, discover it locally, and walk through the host/listener
          lifecycle before the real ATProto and LiveKit adapters are connected.
        </p>
        <div class="actions">
          <button id="seed-room" type="button">Create demo room</button>
          <button id="refresh" class="secondary" type="button">Refresh discovery</button>
          <button id="reset" class="danger" type="button">Reset local demo</button>
        </div>
      </div>
      <aside class="card stage" id="stage">
        <div>
          <p class="eyebrow">Current session</p>
          <h2>No room joined</h2>
          <p>Join a room to simulate the LiveKit handoff.</p>
        </div>
      </aside>
    </section>

    <section class="card">
      <h2>Create a room</h2>
      <form id="room-form" class="form-grid">
        <label>
          Room title
          <input id="title" maxlength="120" required value="Ocean Floor Standup" />
        </label>
        <label>
          Description
          <textarea id="description" maxlength="1000" rows="3">A quick live room for testing the ATProto room lifecycle.</textarea>
        </label>
        <div class="actions">
          <button type="submit">Publish room record</button>
          <span class="status" id="status" role="status"></span>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Discovered live rooms</h2>
      <div id="rooms" class="room-grid"></div>
    </section>
  </main>
`;

const roomForm = app.querySelector<HTMLFormElement>('#room-form')!;
const titleInput = app.querySelector<HTMLInputElement>('#title')!;
const descriptionInput = app.querySelector<HTMLTextAreaElement>('#description')!;
const roomsElement = app.querySelector<HTMLDivElement>('#rooms')!;
const statusElement = app.querySelector<HTMLSpanElement>('#status')!;
const stageElement = app.querySelector<HTMLElement>('#stage')!;

function setStatus(message: string): void {
  statusElement.textContent = message;
}

function roomUrl(room: BeachwaveRoom): string {
  const url = new URL(window.location.href);
  url.searchParams.set('room', room.uri);
  return url.toString();
}

async function refreshRooms(): Promise<void> {
  rooms = await listRooms(client);
  renderRooms();
}

function renderRooms(): void {
  if (rooms.length === 0) {
    roomsElement.innerHTML = '<p class="empty">No live rooms yet. Create one to start the demo.</p>';
    return;
  }

  roomsElement.replaceChildren(...rooms.map((room) => {
    const article = document.createElement('article');
    article.className = 'card room';

    const title = document.createElement('h3');
    title.textContent = room.record.title;

    const description = document.createElement('p');
    description.textContent = room.record.description ?? 'No description provided.';

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = '● Live';

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `
      <span><strong>AT URI</strong> <code></code></span>
      <span><strong>LiveKit room</strong> <code></code></span>
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
    joinButton.addEventListener('click', () => handleJoin(room));

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'secondary';
    copyButton.textContent = 'Copy room link';
    copyButton.addEventListener('click', () => handleCopy(room));

    const endButton = document.createElement('button');
    endButton.type = 'button';
    endButton.className = 'danger';
    endButton.textContent = 'End room';
    endButton.addEventListener('click', () => handleEnd(room));

    actions.append(joinButton, copyButton, endButton);
    article.append(badge, title, description, meta, actions);
    return article;
  }));
}

async function handleJoin(room: BeachwaveRoom): Promise<void> {
  const joined = await joinRoom(client, room.uri);
  activeRoom = joined.room;
  stageElement.innerHTML = `
    <div>
      <p class="eyebrow">Joined room</p>
      <h2></h2>
      <p>LiveKit handoff target: <strong></strong></p>
      <button id="leave" class="secondary" type="button">Leave audio</button>
    </div>
  `;
  stageElement.querySelector('h2')!.textContent = activeRoom.record.title;
  stageElement.querySelector('strong')!.textContent = joined.livekitRoom;
  stageElement.querySelector('#leave')!.addEventListener('click', handleLeave);
}

async function handleLeave(): Promise<void> {
  await leaveRoom();
  activeRoom = undefined;
  stageElement.innerHTML = `
    <div>
      <p class="eyebrow">Current session</p>
      <h2>No room joined</h2>
      <p>Join a room to simulate the LiveKit handoff.</p>
    </div>
  `;
}

async function handleCopy(room: BeachwaveRoom): Promise<void> {
  await navigator.clipboard.writeText(roomUrl(room));
  setStatus('Copied room link.');
}

async function handleEnd(room: BeachwaveRoom): Promise<void> {
  await endRoom(client, room.uri);
  if (activeRoom?.uri === room.uri) await handleLeave();
  setStatus('Room ended.');
  await refreshRooms();
}

roomForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await createRoom(client, {
    title: titleInput.value,
    description: descriptionInput.value
  });
  setStatus('Room record published locally.');
  await refreshRooms();
});

app.querySelector('#seed-room')!.addEventListener('click', async () => {
  await createRoom(client, {
    title: 'Codex Demo Room',
    description: 'A seeded room that demonstrates discovery, sharing, joining, and ending.'
  });
  setStatus('Demo room created.');
  await refreshRooms();
});

app.querySelector('#refresh')!.addEventListener('click', refreshRooms);
app.querySelector('#reset')!.addEventListener('click', async () => {
  client.clear();
  await handleLeave();
  setStatus('Local demo data reset.');
  await refreshRooms();
});

await refreshRooms();
