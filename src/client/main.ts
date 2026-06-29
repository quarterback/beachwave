import { createRoom, endRoom, listRooms, type AirwaveRoom } from '../sdk/index.js';
import { MemoryRepositoryClient } from '../sdk/memory-client.js';

const client = new MemoryRepositoryClient('did:example:reference-client');
const app = document.querySelector<HTMLDivElement>('#root');

if (!app) throw new Error('Missing #root element');

app.innerHTML = `
  <main>
    <h1>Airwave</h1>
    <p>Reference client for live audio rooms announced with ATProto records and transported with LiveKit.</p>
    <label>Room title <input id="title" value="Airwave Demo Room" /></label>
    <button id="create">Create room</button>
    <button id="discover">Discover rooms</button>
    <section><h2>Live rooms</h2><div id="rooms"></div></section>
  </main>
`;

const roomsElement = app.querySelector<HTMLDivElement>('#rooms')!;
const titleElement = app.querySelector<HTMLInputElement>('#title')!;

function renderRooms(rooms: AirwaveRoom[]) {
  roomsElement.replaceChildren(...rooms.map((room) => {
    const article = document.createElement('article');
    article.innerHTML = `<h3></h3><p></p><code></code> `;
    article.querySelector('h3')!.textContent = room.record.title;
    article.querySelector('p')!.textContent = room.record.description ?? 'No description provided.';
    article.querySelector('code')!.textContent = room.record.livekitRoom;
    const endButton = document.createElement('button');
    endButton.textContent = 'End room';
    endButton.addEventListener('click', async () => {
      await endRoom(client, room.uri);
      renderRooms(await listRooms(client));
    });
    article.append(endButton);
    return article;
  }));
}

app.querySelector('#create')!.addEventListener('click', async () => {
  await createRoom(client, { title: titleElement.value });
  renderRooms(await listRooms(client));
});
app.querySelector('#discover')!.addEventListener('click', async () => renderRooms(await listRooms(client)));
