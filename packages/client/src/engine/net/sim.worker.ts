/** Solo play: the authoritative simulation runs here, off the main thread, with no server cost. */
import RAPIER from '@dimforge/rapier3d-compat';
import { GameSim, SNAPSHOT_RATE, TICK_RATE, encodeSnapshot, type ClientMsg, type ItemId, type MapId, type SpeciesId, type WorldMeta } from '@dino/shared';
import type { Mode } from '@dino/shared/sim/ai.ts';
import { SimWorld, type WorldBlobs } from '@dino/shared/sim/world.ts';
import { loadNav } from '@dino/shared/sim/nav.ts';

const ROOT = `${import.meta.env.BASE_URL}assets/world/`;
const dirOf = (map: string) => (map === 'hollow' ? ROOT : `${ROOT}${map}/`);
const gz = async (base: string, name: string) => {
  const buf = await (await fetch(`${base}${name}.gz`)).arrayBuffer();
  const h = new Uint8Array(buf, 0, 2);
  if (h[0] !== 0x1f || h[1] !== 0x8b) return buf;
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
};

let sim: GameSim | null = null;
let started = false;
const pending: ClientMsg[] = [];
const worlds = new Map<string, Promise<SimWorld>>();

/** Every map stays loaded once visited, so going back is quick. */
function loadWorld(map: string) {
  let w = worlds.get(map);
  if (w) return w;
  w = (async () => {
    const base = dirOf(map);
    const [meta, ph, cp, ci, ob, nav] = await Promise.all([
      fetch(`${base}meta.json`).then((r) => r.json() as Promise<WorldMeta>), gz(base, 'phys-height.bin'), gz(base, 'cave-col-pos.bin'), gz(base, 'cave-col-idx.bin'), gz(base, 'obstacles.bin'), gz(base, 'nav.bin'),
    ]);
    const blobs: WorldBlobs = { meta, physHeights: new Float32Array(ph), cavePos: new Float32Array(cp), caveIdx: new Uint32Array(ci), obstacles: new Float32Array(ob), nav: new Uint8Array(nav) };
    return new SimWorld(RAPIER, blobs, await loadNav(blobs.nav!));
  })();
  worlds.set(map, w);
  return w;
}

async function boot() {
  await RAPIER.init();
  postMessage('ready');
}

async function begin(m: Extract<ClientMsg, { t: 'hello' }>) {
  const world = await loadWorld(m.save?.map ?? 'hollow');
  const s = new GameSim(world, (_to, e) => postMessage(e), m.save?.seed ?? Math.floor(Math.random() * 1e9));
  s.loadMap = loadWorld;
  s.onSave = (data) => postMessage({ t: 'save', data });
  if (m.save) s.restore(m.save);
  s.addPlayer(1, m.name, m.character);
  sim = s;
  for (const q of pending.splice(0)) onMessage(q);
  const snapEvery = Math.round(TICK_RATE / SNAPSHOT_RATE);
  let n = 0;
  setInterval(() => {
    s.step();
    if (++n % snapEvery) return;
    const snap = s.snapshotFor(1);
    if (snap) { const b = encodeSnapshot(snap); postMessage(b, [b]); }
  }, 1000 / TICK_RATE);
}

function onMessage(m: ClientMsg) {
  if (m.t === 'hello') { if (!started) { started = true; void begin(m); } return; }
  if (!sim) { pending.push(m); return; }
  const dev = m as unknown as { t: string; time?: number; mission?: number; at?: [number, number, number]; give?: [ItemId, number][]; spawn?: { species: SpeciesId; x: number; y: number; z: number; mode?: Mode }[]; fire?: [number, number, number]; travel?: [MapId, string]; flags?: string[]; show?: string[]; build?: Record<string, number> };
  if (dev.t === 'dev' && import.meta.env.DEV) {
    const p = sim.players.get(1);
    if (dev.travel) sim.travel(dev.travel[0], dev.travel[1]);
    if ((dev as { clear?: boolean }).clear) sim.clearAll();
    Object.assign(sim.story.env, (dev as { env?: object }).env ?? {});
    if (dev.time !== undefined) sim.time = dev.time;
    for (const f of dev.flags ?? []) sim.story.set(f);
    if (dev.show) sim.story.show(...dev.show);
    for (const [id, stage] of Object.entries(dev.build ?? {})) { sim.story.stage[id] = stage; sim.out(null, { t: 'structure', id, stage }); sim.story.applyBlock(id); }
    if (dev.mission !== undefined) sim.advanceTo(dev.mission);
    if (dev.at && p) Object.assign(p, { x: dev.at[0], y: dev.at[1], z: dev.at[2] });
    for (const [id, n] of dev.give ?? []) if (p) sim.give(p, id, n);
    for (const s of dev.spawn ?? []) { const d = sim.spawn(s.species, s, null); if (s.mode) d.mode = s.mode; }
    return;
  }
  sim.handle(1, m);
}

self.onmessage = (ev) => onMessage(ev.data as ClientMsg);
void boot();
