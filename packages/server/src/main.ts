/** Authoritative co-op server: one GameSim per party, addressed by a short invite code. */
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { GameSim, PROTOCOL_VERSION, SNAPSHOT_RATE, TICK_RATE, encodeSnapshot, type ClientMsg, type SaveData, type ServerEvent } from '@dino/shared';
import { loadWorldFromDisk } from '@dino/shared/sim/load-node.ts';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_PLAYERS = 4;
const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/public/assets');

interface Client { id: number; ws: WebSocket; party: Party }
interface Party { code: string; sim: GameSim; clients: Map<number, Client>; nextId: number; timer: NodeJS.Timeout; tick: number }

const parties = new Map<string, Party>();

const makeCode = () => { let c = ''; const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; for (let i = 0; i < 5; i++) c += abc[Math.floor(Math.random() * abc.length)]; return c; };

/** Every party has its own collision world: what one party builds must not stand in another's. */
async function createParty(save?: SaveData): Promise<Party> {
  const code = makeCode();
  const party: Party = { code, clients: new Map(), nextId: 1, tick: 0, sim: null as never, timer: null as never };
  const worlds = new Map<string, ReturnType<typeof loadWorldFromDisk>>();
  const load = (map: string) => { let w = worlds.get(map); if (!w) { w = loadWorldFromDisk(assets, true, map); worlds.set(map, w); } return w; };
  party.sim = new GameSim(await load(save?.map ?? 'hollow'), (to, e) => send(party, to, e), save?.seed ?? Math.floor(Math.random() * 1e9));
  party.sim.loadMap = load;
  party.sim.onSave = (data) => send(party, null, { t: 'save', data });
  if (save) party.sim.restore(save);
  const snapEvery = Math.round(TICK_RATE / SNAPSHOT_RATE);
  party.timer = setInterval(() => {
    party.sim.step();
    if (++party.tick % snapEvery) return;
    for (const c of party.clients.values()) {
      const s = party.sim.snapshotFor(c.id);
      if (s && c.ws.readyState === c.ws.OPEN) c.ws.send(encodeSnapshot(s), { binary: true });
    }
  }, 1000 / TICK_RATE);
  parties.set(code, party);
  console.log('party', code);
  return party;
}

function send(party: Party, to: number | null, e: ServerEvent) {
  const text = JSON.stringify(e);
  for (const c of party.clients.values()) if ((to === null || c.id === to) && c.ws.readyState === c.ws.OPEN) c.ws.send(text);
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, parties: parties.size }));
  void req;
});

const wss = new WebSocketServer({ server, maxPayload: 512 * 1024 });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const code = url.searchParams.get('party')?.toUpperCase();
  let client: Client | null = null;
  let joining = false;
  ws.on('message', async (data, binary) => {
    if (binary) return;
    let m: ClientMsg;
    try { m = JSON.parse(data.toString()) as ClientMsg; } catch { return; }
    if (!client) {
      if (joining) return;
      if (m.t !== 'hello' || m.version !== PROTOCOL_VERSION) { ws.close(4000, 'bad hello'); return; }
      joining = true;
      const party = code ? parties.get(code) : await createParty(m.save);
      if (!party) { ws.close(4004, 'no such party'); return; }
      if (party.clients.size >= MAX_PLAYERS) { ws.close(4003, 'party full'); return; }
      client = { id: party.nextId++, ws, party };
      party.clients.set(client.id, client);
      party.sim.addPlayer(client.id, String(m.name).slice(0, 24) || 'Survivor', Math.max(0, Math.min(3, m.character | 0)));
      ws.send(JSON.stringify({ t: 'party', code: party.code }));
      return;
    }
    client.party.sim.handle(client.id, m);
  });
  ws.on('close', () => {
    if (!client) return;
    const { party, id } = client;
    party.clients.delete(id);
    party.sim.removePlayer(id);
    if (party.clients.size === 0) { clearInterval(party.timer); parties.delete(party.code); console.log('closed', party.code); }
  });
});

server.listen(PORT, () => console.log(`game server on :${PORT}`));
