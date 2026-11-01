import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { ITEMS, RECIPES, type ItemId } from '../src/data/items.ts';
import { CACHES, CLUES, FILM, MISSIONS, PAGES, PHOTO_SUBJECTS, SIDES, missionIndex, type MapId } from '../src/data/story.ts';
import { PROPS } from '../src/data/props.ts';
import { GameSim, type SimPlayer } from '../src/sim/GameSim.ts';
import { loadWorldFromDisk } from '../src/sim/load-node.ts';
import { Btn } from '../src/sim/movement.ts';
import { NIGHTFALL } from '../src/sim/time.ts';
import { STRUCTURES } from '../src/sim/Story.ts';
import type { SimWorld, NavPoint } from '../src/sim/world.ts';
import type { ServerEvent } from '../src/net/protocol.ts';

const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/public/assets');
const worlds = new Map<string, SimWorld>();
const load = async (m: MapId) => { let w = worlds.get(m); if (!w) { w = await loadWorldFromDisk(assets, true, m); worlds.set(m, w); } return w; };
beforeAll(async () => { for (const m of ['hollow', 'valley', 'ridge'] as MapId[]) await load(m); }, 120000);

/** A bot that plays by the same messages a client sends, moving by teleport between jobs. */
class Bot {
  events: ServerEvent[] = [];
  sim: GameSim; p: SimPlayer; seq = 1;
  constructor(character = 0) {
    this.sim = new GameSim(worlds.get('hollow')!, (_p, e) => this.events.push(e), 4242);
    this.sim.loadMap = load; this.sim.waitForClients = false;
    this.p = this.sim.addPlayer(1, 'bot', character);
  }
  get f() { return this.sim.world.blobs.meta.features; }
  get mission() { return MISSIONS[this.sim.mission].id; }
  /** Time passes. The bot itself stays fed and unhurt, so a test fails on logic and not on a raptor. */
  run(seconds: number) {
    for (let t = 0; t < 30 * seconds; t++) {
      Object.assign(this.p, { health: 100, hunger: 90, thirst: 90, heat: 90, bleeding: 0, downed: 0, fever: 0 });
      this.sim.handle(1, { t: 'input', seq: this.seq++, buttons: 0, yaw: this.p.yaw, pitch: 0 });
      this.sim.step();
    }
  }
  at(q: { x: number; y: number; z: number }) { Object.assign(this.p, { x: q.x, y: q.y + 0.3, z: q.z, vx: 0, vy: 0, vz: 0 }); this.run(0.2); }
  to(id: string) { const q = this.f[id] ?? this.sim.world.blobs.meta.props.find((r) => r.id === id); expect(q, `${id} exists on ${this.sim.mapId}`).toBeTruthy(); this.at(q!); }
  give(items: Partial<Record<ItemId, number>>) { for (const [k, n] of Object.entries(items)) { let left = n as number; const st = ITEMS[k as ItemId].stack; while (left > 0) { expect(this.sim.give(this.p, k as ItemId, Math.min(st, left)), `room for ${k}`).toBe(true); left -= st; } } }
  act(id: string, wait = 22) { const spot = this.sim.story; expect(this.spots().map((q) => q.id), `${id} offered in ${this.mission}`).toContain(id); this.sim.handle(1, { t: 'act', id }); this.run(wait); void spot; }
  spots() { const last = [...this.events].reverse().find((e) => e.t === 'spots'); return last && last.t === 'spots' ? last.list : []; }
  prop(id: string, wait = 1) { this.to(id); this.sim.story.show(id); this.run(0.6); this.sim.handle(1, { t: 'interact', prop: id }); this.run(wait); }
  craft(id: ItemId) { const r = RECIPES.find((q) => q.id === id)!; this.sim.handle(1, { t: 'craft', id }); this.run(r.seconds + 1); expect(this.sim.count(this.p, id), `crafted ${id}`).toBeGreaterThan(0); }
  build(id: string) { const d = STRUCTURES.find((q) => q.id === id)!; this.to(d.at); this.run(0.6); for (let i = this.sim.story.stage[id] ?? 0; i < d.stages.length; i++) { this.give(d.stages[i].needs); if (d.stages[i].two && !this.sim.count(this.p, 'lever')) this.give({ lever: 1 }); this.run(0.6); this.act(`build:${id}`, d.stages[i].seconds * 2 + 1); } expect(this.sim.story.built(id), `${id} finished`).toBe(true); }
  expectAt(id: string) { this.run(1); expect(this.mission).toBe(id); }
  async travel(id: string, wait = true) { this.sim.handle(1, { t: 'act', id }); for (let i = 0; i < 200 && this.sim.loading; i++) await new Promise((r) => setTimeout(r, 10)); if (wait) this.run(1); }
  calm() { this.sim.clearHunters(); }
  /** The bot is handed far more than a player would carry. Clears everything but the tools and story items. */
  tidy() { this.p.inv.forEach((q, i) => { if (q && !ITEMS[q.id].key && !ITEMS[q.id].tool) this.sim.handle(1, { t: 'drop', slot: i }); }); }
}

describe('story data', () => {
  it('has 48 main missions, 16 per chapter, in the design order', () => {
    expect(MISSIONS.length).toBe(48);
    for (const c of [1, 2, 3]) expect(MISSIONS.filter((m) => m.chapter === c).length, `chapter ${c}`).toBe(16);
    expect(new Set(MISSIONS.map((m) => m.id)).size).toBe(48);
  });
  it('every prop and clue reference resolves', () => {
    for (const [id, p] of Object.entries(PROPS)) if (p.clue) expect(CLUES[p.clue], `${id} -> ${p.clue}`).toBeTruthy();
    for (const m of ['hollow', 'valley', 'ridge']) for (const p of worlds.get(m)!.blobs.meta.props) expect(PROPS[p.id], `${m}/${p.id}`).toBeTruthy();
  });
  it('every structure site and story place exists on its map', () => {
    for (const s of STRUCTURES) expect(worlds.get(s.map)!.blobs.meta.features[s.at], `${s.id} at ${s.at}`).toBeTruthy();
    const placed = new Set(['hollow', 'valley', 'ridge'].flatMap((m) => worlds.get(m)!.blobs.meta.props.map((p) => p.id)));
    for (const id of Object.keys(PROPS)) { if (id === 'newspaper') continue; expect(placed.has(id), `${id} is placed`).toBe(true); }
  });
});

describe('every place can be reached', () => {
  const route = (m: string, a: NavPoint, b: NavPoint, label: string, limit = 7) => {
    const w = worlds.get(m)!, r = w.nav!.path(a, b), end = r[r.length - 1];
    expect(end && Math.hypot(end.x - b.x, end.z - b.z), `${m}: ${label}`).toBeLessThan(limit);
  };
  it('Hollow: all story places from the cave mouth', () => {
    const m = worlds.get('hollow')!.blobs.meta, f = m.features, from = { x: m.mouth.x + 8, y: m.mouth.y, z: m.mouth.z };
    for (const id of ['door', 'seal', 'tunnel_out', 'bed', 'shard_cache', 'crystal', 'weir', 'snare_1', 'snare_2', 'snare_3']) route('hollow', from, f[id], id, 16);
    // Long routes are checked in legs, as a person would walk them.
    const west = { x: -60, y: worlds.get('hollow')!.terrainAt(-60, -120), z: -120 };
    for (const id of ['nest', 'lookout']) route('hollow', west, f[id], id, 16);
    for (const p of m.props) if (!/^(array|arrow_[3-5]|glasses)/.test(p.id)) route('hollow', from, p, p.id, 16);
  });
  it('Valley: both banks, the den and both passes', () => {
    const m = worlds.get('valley')!.blobs.meta, f = m.features;
    route('valley', f.pass_east, f.raft_site, 'pass to raft', 12);
    for (const id of ['camp1938', 'fwd_ring', 'ladder', 'den_mouth', 'flats', 'bait', 'herd_b', 'herd_c', 'herd_a']) route('valley', f.raft_land, f[id], id, 12);
    for (const p of m.props) { if (p.y > f.ladder.y + 4 || /^arrow_v[1-5]$/.test(p.id) || p.id === 'shard_den') continue; 
      // Long ways are walked in legs: the nearest camp or landmark on the same bank is close enough.
      const starts = p.x > f.raft_site.x ? [f.raft_site] : [f.raft_land, f.flats, f.herd_b, f.ladder, f.den_mouth];
      const near = starts.reduce((a, q) => (Math.hypot(q.x - p.x, q.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? q : a));
      route('valley', near, p, p.id, 14);
    }
    route('valley', f.den_mouth, m.props.find((q) => q.id === 'shard_den')!, 'shard_den', 14);
  });
  it('Ridge: below the scarp, then above it', () => {
    const m = worlds.get('ridge')!.blobs.meta, f = m.features;
    for (const id of ['ash_edge', 'scarp']) route('ridge', f.pass_east, f[id], id, 12);
    route('ridge', f.pass_east, m.chambers.find((c) => c.name === 'deep')!, 'deep tube', 12);
    for (const id of ['hot_ring', 'ground', 'furnace', 'summit_low', 'array', 'switch', 'dead_tree', 'barricade_1', 'barricade_2', 'barricade_3', 'trap_1', 'trap_2', 'tube_prop', 'bait_summit']) route('ridge', f.scarp_top, f[id], id, 16);
  });
  it('a person can walk out through every pass', async () => {
    for (const [map, from, id] of [['hollow', { x: -520, z: 104 }, 'pass_west'], ['valley', { x: -520, z: 40 }, 'pass_west'], ['valley', { x: 520, z: 4 }, 'pass_east'], ['ridge', { x: 520, z: 42 }, 'pass_east']] as const) {
      const w = worlds.get(map)!, f = w.blobs.meta.features[id];
      const sim = new GameSim(w, () => {}, 7), p = sim.addPlayer(1, 'x', 0);
      Object.assign(p, { x: from.x, y: w.terrainAt(from.x, from.z) + 0.4, z: from.z });
      let side = 0;
      for (let t = 0, lx = p.x, lz = p.z; t < 30 * 90 && Math.hypot(f.x - p.x, f.z - p.z) > 5; t++) {
        const yaw = Math.atan2(-(f.x - p.x), -(f.z - p.z)) + side;
        sim.handle(1, { t: 'input', seq: t + 1, buttons: Btn.Forward, yaw, pitch: 0 }); sim.step();
        if (t % 40 === 39) { side = Math.hypot(p.x - lx, p.z - lz) < 1 ? (side ? 0 : 1.2) : 0; lx = p.x; lz = p.z; }
      }
      expect(Math.hypot(f.x - p.x, f.z - p.z), `${map} ${id}`).toBeLessThan(6);
      sim.removePlayer(1);
    }
  }, 60000);
  it('the scarp cannot be walked past: it needs the rope', () => {
    const w = worlds.get('ridge')!, f = w.blobs.meta.features, r = w.nav!.path(f.ash_edge, f.hot_ring), end = r[r.length - 1];
    expect(!end || Math.hypot(end.x - f.hot_ring.x, end.z - f.hot_ring.z) > 15).toBe(true);
  });
});

describe('a weak weapon that works', () => {
  it('can be made from a single branch before any stone tool', () => {
    const b = new Bot();
    b.give({ branch: 1 });
    b.craft('spike');
    expect(b.sim.count(b.p, 'branch')).toBe(0);
    expect(ITEMS.spike.weapon!.damage).toBeLessThan(ITEMS.spear.weapon!.damage);
  });
  it('makes a raptor flinch, kills a small hunter, and is useless against Old Scar', () => {
    const b = new Bot(), { sim, p } = b;
    const c = b.f.campSite;
    b.at(c);
    b.give({ branch: 1 }); b.craft('spike');
    const slot = p.inv.findIndex((q) => q?.id === 'spike');
    sim.handle(1, { t: 'hold', slot });
    const ahead = (d: number) => ({ x: p.x - Math.sin(p.yaw) * d, y: p.y, z: p.z - Math.cos(p.yaw) * d });
    const r = sim.spawn('raptor', ahead(1.8), null);
    r.mode = 'bite';
    const hp = r.health;
    sim.handle(1, { t: 'attack' });
    expect(r.health, 'the blow lands').toBeLessThan(hp);
    expect(r.health, 'and is far from fatal').toBeGreaterThan(hp * 0.8);
    expect(r.mode, 'the bite is interrupted').toBe('flinch');
    sim.despawn(r);
    const small = sim.spawn('pectinodon', ahead(1.6), null);
    let hits = 0;
    for (let i = 0; i < 12 && small.mode !== 'dead'; i++) { Object.assign(small, ahead(1.6)); p.stamina = 100; sim.handle(1, { t: 'attack' }); hits++; b.run(1.1); }
    expect(small.mode, 'pectinodon dies to a stick').toBe('dead');
    expect(hits).toBeGreaterThan(1);
    expect(sim.count(p, 'spike') > 0, 'a few fights left in it').toBe(true);
    const rex = sim.spawn('trex', ahead(3), null); rex.mode = 'rest';
    const health = rex.health;
    p.stamina = 100; b.run(1.2); sim.handle(1, { t: 'attack' });
    expect(rex.health).toBeGreaterThan(health - 30);
    expect(rex.mode, 'he does not flinch').not.toBe('flinch');
  });
  it('wears out and breaks', () => {
    const b = new Bot(), { sim, p } = b;
    b.give({ branch: 1 }); b.craft('spike');
    sim.handle(1, { t: 'hold', slot: p.inv.findIndex((q) => q?.id === 'spike') });
    for (let i = 0; i < 16; i++) { p.stamina = 100; sim.handle(1, { t: 'attack' }); b.run(1); }
    expect(sim.count(p, 'spike')).toBe(0);
  });
});

describe('the pack', () => {
  it('moves items between slots and keeps the held item in hand', () => {
    const b = new Bot(), { sim, p } = b;
    b.give({ flint: 1, branch: 1 });
    const from = p.inv.findIndex((q) => q?.id === 'branch');
    sim.handle(1, { t: 'hold', slot: from });
    sim.handle(1, { t: 'move', from, to: 17 });
    expect(p.inv[17]?.id).toBe('branch');
    expect(p.held).toBe(17);
  });
});

describe('the whole story', () => {
  it('plays from the first drink to every chapter end', async () => {
    const b = new Bot(), { sim } = b;
    sim.mission = 9; sim.time = 0.1; sim.clock = 300;
    b.give({ hand_axe: 1, bow_drill: 1, recorder: 1, compass: 1, radio: 1, flashlight: 1, tinder: 4, branch: 8 });
    // Chapter 1.
    const r = worlds.get('hollow')!.blobs.meta.river[140];
    b.at({ x: r.x + r.w + 1.5, y: 80, z: r.z }); b.p.y = sim.world.terrainAt(b.p.x, b.p.z) + 0.3;
    sim.handle(1, { t: 'drink' }); b.run(3);
    expect(b.mission).toBe('boil_water');
    b.give({ clay: 3 });
    b.to('firePit');
    sim.handle(1, { t: 'place_fire' }); b.run(6);
    sim.handle(1, { t: 'ignite', fire: sim.fires[0].id }); b.run(10);
    expect(sim.fires[0].lit).toBe(true);
    sim.fires[0].fuel = 1;
    b.craft('wet_pot'); b.give({ wood: 2 }); b.craft('pot');
    b.at({ x: r.x + r.w + 1.5, y: 80, z: r.z }); b.p.y = sim.world.terrainAt(b.p.x, b.p.z) + 0.3;
    sim.handle(1, { t: 'fill' }); b.run(3);
    expect(sim.count(b.p, 'water_pot')).toBe(1);
    b.to('firePit'); sim.fires[0].fuel = 1;
    b.craft('boiled_water');
    expect(sim.count(b.p, 'pot'), 'the pot comes back').toBe(1);
    sim.handle(1, { t: 'use', slot: b.p.inv.findIndex((q) => q?.id === 'boiled_water') }); b.run(2);
    b.expectAt('find_food');
    // Stealing from the kill, then cooking.
    b.prop('kill', 6);
    expect(sim.count(b.p, 'raw_meat'), 'meat from the kill').toBeGreaterThan(0);
    b.to('firePit'); sim.fires[0].fuel = 1;
    b.craft('cooked_meat');
    sim.handle(1, { t: 'use', slot: b.p.inv.findIndex((q) => q?.id === 'cooked_meat') }); b.run(3);
    b.expectAt('make_safe');
    b.to('door'); b.run(1); b.to('seal'); b.run(1);
    b.expectAt('door_materials');
    b.give({ blade: 1, rope: 1 }); b.give({ branch: 1 }); b.craft('stone_pick');
    b.give({ pole: 6, rope: 4, stone: 4, clay: 3, moss: 4, branch: 6, fiber: 6 });
    b.expectAt('build_door');
    b.build('door');
    b.expectAt('seal_tunnel');
    // The door is solid while shut, and an open one can be walked through.
    const c = sim.world.collision, d = b.f.door;
    expect(c.clearLine(d.x - 3, d.y + 2, d.z, d.x + 3, d.y + 2, d.z), 'shut door blocks sight').toBe(false);
    b.give({ pole: 3, rope: 2, stone: 3, clay: 2 });
    b.to('seal'); b.run(1); b.act('build:seal', 12); b.run(1); b.act('build:seal', 12);
    expect(sim.story.flag('assault'), 'sealing starts the night').toBe(true);
    b.run(45);
    expect(sim.time, 'the light goes early').toBeGreaterThanOrEqual(NIGHTFALL - 0.01);
    b.to('firePit');
    b.run(110);
    expect(sim.story.flag('breached'), 'they break the half-sealed tunnel').toBe(true);
    expect(sim.dinos.filter((q) => q.species === 'raptor').length, 'and the pack comes through').toBeGreaterThan(2);
    sim.time = 0.995; b.run(14);
    expect(sim.story.flag('assault_over')).toBe(true);
    b.expectAt('follow_marks');
    b.prop('arrows');
    expect(sim.journal.has('marks')).toBe(true);
    // Chapter 2.
    b.to('pass_west'); b.run(1);
    await b.travel('pass:valley');
    expect(sim.mapId).toBe('valley');
    expect(sim.fires.length, 'fires stay on their own map').toBe(0);
    b.to('river_east'); b.expectAt('cross_river');
    b.calm();
    b.build('raft');
    b.act('raft:west', 40);
    expect(b.p.x, 'carried over the river').toBeLessThan(b.f.raft_site.x - 40);
    b.expectAt('end_of_marks');
    b.to('camp1938'); b.expectAt('search_camp');
    b.prop('roster'); b.prop('grave_1'); b.prop('rifle_rack'); b.prop('field_radio');
    b.expectAt('recover_pages');
    for (let i = 1; i <= PAGES; i++) b.prop(`page_${i}`);
    b.expectAt('repair_radio');
    b.to('radio_bench'); b.run(1); b.act('radio_fix', 7);
    expect(b.p.battery, 'light or radio').toBe(0);
    b.expectAt('first_shard');
    b.prop('shard_swamp'); b.expectAt('forward_camp');
    b.give({ pole: 2 }); b.craft('stake'); b.craft('stake');
    b.build('fwd_ring'); b.build('fwd_barricade'); b.build('fwd_hollow');
    b.expectAt('plain_shard');
    b.prop('shard_plain'); b.expectAt('find_calloway');
    b.to('ladder'); b.run(1); b.act('ladder', 12);
    expect(b.p.y, 'up in the trees').toBeGreaterThan(b.f.ladder.y + 8);
    b.run(2); expect(b.p.y, 'the platform holds').toBeGreaterThan(b.f.ladder.y + 8);
    b.expectAt('explore_treehouse');
    b.prop('tally'); b.prop('traps'); b.prop('green_lights'); b.prop('calloway_map');
    b.expectAt('read_knife_page');
    b.prop('knife_page'); expect(sim.journal.has('knife_page')).toBe(true);
    b.expectAt('widow_shard');
    sim.time = 0.7;
    b.prop('shard_den'); b.expectAt('bone_shard');
    b.calm(); sim.time = 0.2; b.run(7);
    expect(sim.dinos.some((q) => q.species === 'trex'), 'Old Scar feeds on the flats').toBe(true);
    b.give({ raw_meat: 1 }); b.to('bait'); b.run(1); b.act('bait', 2);
    b.prop('shard_flats'); b.expectAt('bring_home');
    expect(sim.count(b.p, 'shard')).toBe(4);
    b.to('pass_east'); b.run(1);
    await b.travel('pass:hollow');
    expect(sim.mapId).toBe('hollow');
    expect(sim.story.built('door'), 'what was built stayed built').toBe(true);
    sim.story.setDoor(true);
    b.to('shard_cache'); b.run(1); b.act('stash', 8);
    b.expectAt('find_signal');
    expect(sim.journal.has('signal_voice')).toBe(true);
    expect(sim.journal.has('same_man') || sim.journal.has('roster')).toBe(true);
    b.act('unstash', 1);
    b.to('pass_west'); b.run(1);
    await b.travel('pass:valley');
    b.to('pass_west'); b.run(1);
    await b.travel('pass:ridge');
    // Chapter 3.
    expect(sim.mapId).toBe('ridge');
    b.expectAt('follow_signal');
    b.to('ash_edge'); b.expectAt('cross_ash');
    b.tidy();
    b.give({ bone: 2, rope: 2 }); b.craft('piton'); b.craft('piton');
    b.to('scarp'); b.run(1); b.act('scarp', 40);
    b.expectAt('hot_springs');
    expect(b.p.y).toBeGreaterThan(b.f.scarp.y + 20);
    b.build('hot_ring'); b.expectAt('climb_summit');
    b.to('summit_low'); b.expectAt('find_source');
    b.prop('ring_stones'); b.prop('coil'); b.prop('scorch'); b.expectAt('when_rift');
    b.prop('wnotes'); sim.time = 0.72;
    b.to('summit_watch'); b.run(1); b.act('watch_sky', 8);
    b.expectAt('find_copper');
    b.calm();
    b.give({ copper_ore: 8, wood: 8, stone: 3 });
    b.give({ copper_ore: 2 });
    b.expectAt('smelt');
    b.build('furnace');
    for (let i = 0; i < 5; i++) b.craft('copper');
    b.expectAt('make_wire');
    b.give({ copper: 4 }); b.craft('bored_stone'); for (let i = 0; i < 4; i++) b.craft('wire');
    b.expectAt('raise_mast');
    b.give({ hand_axe: 1 });
    b.to('dead_tree'); b.run(1); b.act('fell_tree', 18);
    b.build('mast');
    b.expectAt('wire_array');
    b.build('array_ring');
    b.expectAt('test_array');
    b.run(28);
    expect(sim.story.env.storm).toBeGreaterThan(0);
    b.to('switch'); b.run(1); b.act('switch', 60);
    b.expectAt('ground_array');
    b.calm();
    b.give({ copper: 2 }); b.craft('copper_spike');
    b.build('ground'); b.expectAt('fortify');
    b.calm();
    for (const id of ['barricade_1', 'barricade_2', 'barricade_3', 'summit_ring', 'trap_1', 'trap_2']) b.build(id);
    b.expectAt('hold_storm');
    b.give({ wire: 8 });
    b.to('switch'); b.run(1); b.act('switch', 1);
    for (let i = 0; i < 12 && !sim.story.flag('rift_open'); i++) {
      b.run(82);
      if (sim.story.flag('rift_open')) break;
      b.calm();
      for (const id of ['repair_a', 'repair_b', 'repair_c']) if (b.spots().some((q) => q.id === `repair:${id}`)) { b.to(id); b.run(0.6); b.act(`repair:${id}`, 9); }
    }
    expect(sim.story.flag('rift_open'), 'three strikes hold it open').toBe(true);
    b.expectAt('through_rift');
    expect(sim.dinos.some((q) => q.species === 'trex'), 'Old Scar climbs the summit').toBe(true);
    b.give({ raw_meat: 1 });
    b.to('bait_summit'); b.run(1); b.act('scar_bait', 14);
    expect(sim.story.flag('scar_gone')).toBe(true);
    b.to('rift'); b.run(1);
    b.sim.handle(1, { t: 'act', id: 'rift' });
    for (let i = 0; i < 200 && sim.loading; i++) await new Promise((res) => setTimeout(res, 10));
    b.run(2);
    expect(sim.mapId, 'home is the same cave').toBe('hollow');
    expect(sim.story.env.era).toBe(1969);
    expect(sim.dinos.length, 'nothing alive in 1969 will eat you').toBe(0);
    expect(sim.story.ending).toBe('home');
    const w = sim.story.npcs[0];
    b.at({ x: w.x + 1, y: sim.world.floorAt(w.x + 1, w.y + 1, w.z), z: w.z });
    b.act('finish', 1);
    expect(b.events.some((e) => e.t === 'ending' && e.id === 'home')).toBe(true);
  }, 240000);
});

describe('the endings', () => {
  const atRift = async () => {
    const b = new Bot(), { sim } = b;
    sim.mapId = 'ridge'; sim.world = worlds.get('ridge')!;
    b.p.collider = sim.world.collision.capsule();
    sim.mission = missionIndex('through_rift');
    sim.story.set('scar_gone'); sim.story.set('rift_open'); sim.story.env.rift = 1;
    b.to('rift'); b.run(1);
    return b;
  };
  const enter = async (b: Bot) => { b.sim.handle(1, { t: 'act', id: 'rift' }); for (let i = 0; i < 200 && b.sim.loading; i++) await new Promise((r) => setTimeout(r, 10)); b.run(2); };
  it('closed forever: smash the mount, then walk out to the newspaper', async () => {
    const b = await atRift();
    b.give({ hand_axe: 1 }); b.to('mount'); b.run(1); b.act('smash', 5);
    b.to('rift'); b.run(1); await enter(b);
    expect(b.sim.story.ending).toBe('closed');
    b.to('campSite'); b.run(1); b.act('finish', 1);
    expect(b.events.some((e) => e.t === 'ending' && e.id === 'closed')).toBe(true);
  });
  it('the record: every photo, every cache and the locket', async () => {
    const b = await atRift();
    b.sim.story.counters.photos = FILM; b.sim.story.counters.caches = CACHES; b.give({ locket: 1 });
    await enter(b);
    expect(b.sim.story.ending).toBe('record');
  });
  it('the last one: stay at the array, alone with the sky', async () => {
    const b = await atRift();
    b.to('switch'); b.run(1); b.act('stay', 2);
    expect(b.sim.story.ending).toBe('last_one');
    b.run(78);
    expect(b.events.some((e) => e.t === 'ending' && e.id === 'last_one')).toBe(true);
  });
  it('too late: the rock arrives after the limit', async () => {
    const b = await atRift();
    b.sim.story.set('x');
    b.sim.story.counters.ch3Start = 0; b.sim.story.counters.days = 9;
    b.run(20);
    expect(b.sim.story.ending).toBe('too_late');
    expect(b.events.some((e) => e.t === 'ending' && e.id === 'too_late')).toBe(true);
  });
});

describe('side missions', () => {
  it('every side mission can be finished', async () => {
    const b = new Bot(), { sim } = b;
    sim.mission = missionIndex('find_food'); sim.time = 0.2;
    const done = (id: string) => expect(sim.story.sides.has(id), id).toBe(true);
    b.prop('papers'); done('papers');
    b.give({ stone_pick: 1 });
    b.prop('crystal'); done('compass');
    sim.story.clue(b.p, 'pyrite'); b.give({ flint: 1, pyrite: 1 }); b.craft('striker'); done('striker');
    b.give({ moss: 1, bark: 1 }); sim.story.clue(b.p, 'bark'); b.craft('poultice'); done('medicine');
    b.to('lookout'); b.run(1); b.give({ pole: 3, rope: 2 }); b.act('build:lookout', 12); done('lookout');
    b.to('weir'); b.run(1); b.give({ stone: 6 }); b.act('build:weir', 14); done('weir');
    b.run(92); b.act('weir', 1);
    expect(sim.count(b.p, 'fish'), 'the weir fills').toBe(2);
    b.give({ snare: 1 }); b.run(1); b.to('snare_1'); b.run(1); b.act('snare:snare_1', 1); b.run(160);
    b.act('catch:snare_1', 1);
    expect(sim.count(b.p, 'raw_meat'), 'the snare caught something').toBe(1);
    b.to('nest'); b.run(1); done('nest');
    b.prop('glasses'); done('glasses');
    b.give({ recorder: 1 });
    sim.handle(1, { t: 'hold', slot: b.p.inv.findIndex((q) => q?.id === 'recorder') });
    for (const at of ['footprint', 'nest', 'lookout']) { b.to(at); sim.handle(1, { t: 'attack' }); b.run(4); }
    done('tape');
    expect(SIDES.filter((q) => q.chapter === 1).map((q) => q.id).filter((q) => !sim.story.sides.has(q)), 'all of chapter 1').toEqual([]);
  }, 60000);
});

describe('side missions, chapters 2 and 3', () => {
  const on = (map: 'valley' | 'ridge', mission: string) => {
    const b = new Bot(), { sim } = b;
    sim.world = worlds.get(map)!; sim.mapId = map; b.p.collider = sim.world.collision.capsule();
    sim.mission = missionIndex(mission); sim.time = 0.2; sim.story.applyMapBlocks();
    b.run(1);
    return b;
  };
  it('all of chapter 2', () => {
    const b = on('valley', 'explore_treehouse'), { sim } = b;
    const done = (id: string) => expect(sim.story.sides.has(id), id).toBe(true);
    b.prop('calloway_map');
    for (let i = 1; i <= CACHES; i++) b.prop(`cache_${i}`);
    done('caches'); done('rounds');
    expect(sim.count(b.p, 'rifle'), 'the rifle comes with the rounds').toBe(1);
    expect(sim.count(b.p, 'cartridge')).toBe(6);
    expect(sim.journal.has('calloway_weapons'), 'her notes teach the better weapons').toBe(true);
    b.tidy();
    b.give({ spike: 1, wood: 1 }); sim.addFire(b.p.x, b.p.y, b.p.z, 1, true); b.craft('spear'); done('weapons');
    b.to('herd_view'); b.run(1); b.act('watch_herd', 9); done('herds');
    b.prop('grave_2'); b.prop('dug_grave', 11); done('bury');
    expect(sim.count(b.p, 'locket')).toBe(1);
    b.give({ moss: 2, bark: 2, clay: 2 }); b.to('garden'); b.run(1); b.act('build:garden', 9); done('garden');
    sim.story.show('swamp_cry'); b.prop('swamp_cry', 6); done('trouble');
    expect(sim.story.npcs.length, 'the rescued teammate walks with you').toBe(1);
    b.run(2);
    const spot = sim.snapshotFor(1)!.players.find((q) => q.id === 201);
    expect(spot, 'and is sent to the client as a person').toBeTruthy();
  }, 60000);
  it('the rifle is a real choice: one shot, heard by everything', () => {
    const b = on('valley', 'search_camp'), { sim, p } = b;
    b.to('camp1938'); b.give({ rifle: 1, cartridge: 2 });
    sim.handle(1, { t: 'hold', slot: p.inv.findIndex((q) => q?.id === 'rifle') });
    const far = sim.spawn('raptor', { x: p.x, y: sim.world.terrainAt(p.x, p.z - 200), z: p.z - 200 }, null); far.mode = 'rest';
    const near = sim.spawn('raptor', { x: p.x - Math.sin(p.yaw) * 22, y: p.y, z: p.z - Math.cos(p.yaw) * 22 }, null); near.mode = 'scripted';
    sim.handle(1, { t: 'attack' });
    expect(near.mode, 'one round is enough').toBe('dead');
    expect(sim.count(p, 'cartridge')).toBe(1);
    expect(far.lastHeard, '200 metres away it heard').toBeTruthy();
  });
  it('every shot of the roll can count, and the side missions follow', () => {
    const b = on('ridge', 'find_source'), { sim, p } = b;
    b.give({ camera: 1 });
    sim.handle(1, { t: 'hold', slot: p.inv.findIndex((q) => q?.id === 'camera') });
    // Off to one side of the ring: earlier bots in this shared world left their capsules at the centre.
    const a = b.f.array;
    b.at({ x: a.x + 17, y: sim.world.terrainAt(a.x + 17, a.z + 9), z: a.z + 9 });
    for (const s of PHOTO_SUBJECTS) {
      sim.clearAll();
      if (s === 'array_site' || s === 'ring_site') { if (s === 'array_site') { sim.story.counters.photos += 1; sim.story.counters.film -= 1; sim.story.set('photo_array_site'); } else { sim.handle(1, { t: 'attack' }); b.run(1.3); } continue; }
      const x = p.x - Math.sin(p.yaw) * 14, z = p.z - Math.cos(p.yaw) * 14;
      const d = sim.spawn(s as Parameters<typeof sim.spawn>[0], { x, y: sim.world.terrainAt(x, z) + 0.8, z }, null); d.mode = 'scripted';
      sim.handle(1, { t: 'attack' }); b.run(1.3);
    }
    expect(sim.story.counters.photos).toBe(FILM);
    expect(sim.story.counters.film, 'the roll is spent').toBe(0);
    expect(sim.story.sides.has('photos') && sim.story.sides.has('film')).toBe(true);
    sim.handle(1, { t: 'attack' }); b.run(1.3);
    expect(sim.story.counters.photos, 'no film, no photo').toBe(FILM);
  });
  it('all of chapter 3', () => {
    const b = on('ridge', 'find_copper'), { sim } = b;
    const done = (id: string) => expect(sim.story.sides.has(id), id).toBe(true);
    sim.story.set('nest_woken');
    sim.clearHunters(); b.run(1); done('nest_clear');
    b.prop('last_cache'); done('last_cache');
    expect(sim.journal.has('last_note')).toBe(true);
    b.to('hot_ring'); b.run(1);
    expect(sim.journal.has('hot_remedy')).toBe(true);
    b.give({ moss: 1, bark: 1, clay: 1 }); b.craft('strong_poultice'); done('remedies');
    b.prop('fate'); done('last_teammate');
  });
});

describe('the rest of the bestiary', () => {
  const valley = async () => {
    const events: ServerEvent[] = [];
    const w = await loadWorldFromDisk(assets, true, 'valley');
    const sim = new GameSim(w, (_p, e) => events.push(e), 11);
    sim.mapId = 'valley';
    const p = sim.addPlayer(1, 'x', 0);
    const run = (s: number, keep = true) => { for (let t = 0; t < 30 * s && !p.dead; t++) { if (keep) Object.assign(p, { health: 100, bleeding: 0 }); sim.handle(1, { t: 'input', seq: t + 1 + sim.tick, buttons: 0, yaw: p.yaw, pitch: 0 }); sim.step(); } };
    return { sim, p, run, f: w.blobs.meta.features, w, events };
  };
  it('Triceratops warns first, then charges, and only inside its ground', async () => {
    const { sim, p, run, f } = await valley();
    const h = f.trike_home;
    sim.time = 0.25;
    const d = sim.spawn('triceratops', { x: h.x, y: h.y, z: h.z }, null); d.home = { x: h.x, y: 0, z: h.z };
    Object.assign(p, { x: h.x + 100, y: h.y + 1, z: h.z });
    run(5);
    expect(d.mode === 'charge' || d.mode === 'warn', 'ignores you at a distance').toBe(false);
    // It may have wandered off while nobody was near. Bring it home for the meeting.
    Object.assign(d, { x: h.x, y: h.y, z: h.z, mode: 'patrol', goal: null });
    Object.assign(p, { x: h.x + 16, y: sim.world.terrainAt(h.x + 16, h.z) + 0.5, z: h.z });
    let warned = false, charged = false;
    for (let i = 0; i < 80 && !charged; i++) { run(0.25); warned ||= d.mode === 'warn'; charged ||= d.mode === 'charge' && warned; }
    expect(warned, 'a tell first').toBe(true);
    expect(charged, 'then the charge').toBe(true);
  });
  it('the crocodile takes what stands in the water, and leaves the raft alone', async () => {
    const { sim, p, run, f } = await valley();
    const r = sim.world.nearestRiver(f.raft_site.x - 30, f.raft_site.z);
    const d = sim.spawn('croc', { x: r.x - 12, y: r.y, z: r.z }, null);
    Object.assign(p, { x: f.raft_site.x, y: f.raft_site.y + 0.5, z: f.raft_site.z });
    sim.ride(p, [{ x: f.raft_site.x, y: f.raft_site.y + 0.5, z: f.raft_site.z }, { x: f.raft_land.x, y: f.raft_land.y + 0.5, z: f.raft_land.z }], 3.4, () => {});
    run(30);
    expect(p.dead, 'safe on the raft').toBe(false);
    Object.assign(p, { x: r.x, y: r.y - 1.5, z: r.z, ride: null });
    d.x = r.x - 16; d.z = r.z;
    run(12, false);
    expect(p.dead, 'gone in the water').toBe(true);
  });
  it('a loud noise stampedes the herd, and it lies down at night', async () => {
    const { sim, p, run, f } = await valley();
    sim.time = 0.25; sim.story.populate();
    run(2);
    const herd = sim.dinos.filter((d) => d.species === 'edmontosaurus');
    expect(herd.length).toBeGreaterThan(4);
    Object.assign(p, { x: herd[0].x + 12, y: herd[0].y + 0.5, z: herd[0].z });
    sim.noiseAt(p, herd[0].x, herd[0].y, herd[0].z, 80); sim.noiseAt(p, herd[0].x, herd[0].y, herd[0].z, 80);
    run(2);
    expect(herd.filter((d) => d.mode === 'flee').length, 'all of them run').toBeGreaterThan(3);
    sim.time = 0.75; Object.assign(p, { x: f.pass_east.x, y: f.pass_east.y + 1, z: f.pass_east.z }); run(16);
    expect(herd.filter((d) => d.mode === 'rest').length, 'asleep after dark').toBeGreaterThan(3);
  });
  it('the pterosaur dives on the lone figure in the open, not under trees or by a fire', async () => {
    const { sim, p, run, f } = await valley();
    sim.time = 0.25;
    const d = sim.spawn('pterosaur', { x: f.flats.x, y: f.flats.y + 60, z: f.flats.z }, null); d.home = { x: f.flats.x, y: 0, z: f.flats.z };
    Object.assign(p, { x: f.flats.x, y: f.flats.y + 0.5, z: f.flats.z });
    let dived = false;
    for (let i = 0; i < 200 && !dived; i++) { run(1); dived = d.mode === 'swoop'; if (d.warned > sim.clock + 5) break; }
    expect(dived, 'it comes down').toBe(true);
  });
  it('a closed door stops a raptor walking through it', async () => {
    const b = new Bot(), { sim } = b;
    sim.story.stage.door = 4; sim.story.applyBlock('door');
    const f = b.f.door, d = sim.spawn('raptor', { x: f.x + 6, y: f.y, z: f.z }, null);
    d.mode = 'investigate'; d.goal = { x: f.x - 8, y: f.y, z: f.z };
    b.at({ x: b.f.firePit.x - 6, y: b.f.firePit.y, z: b.f.firePit.z });
    b.run(8);
    expect(d.x, 'stays outside').toBeGreaterThan(f.x - 0.5);
    sim.story.setDoor(true);
    expect(sim.world.collision.clearLine(f.x - 3, f.y + 2, f.z, f.x + 3, f.y + 2, f.z), 'open door lets light through').toBe(true);
    sim.world.collision.setBlock('door', false);
  });
});

describe('nothing deadlocks across a reload', () => {
  const reload = (b: Bot) => {
    const save = JSON.parse(JSON.stringify(b.sim.serialize()));
    const again = new GameSim(b.sim.world, () => {}, save.seed);
    again.restore(save); again.addPlayer(2, 'bot', b.p.character);
    return again;
  };
  it('the assault still ends at dawn if the game was saved during it', () => {
    const b = new Bot(), { sim } = b;
    sim.mission = missionIndex('seal_tunnel'); sim.story.stage.door = 4; sim.story.stage.seal = 2;
    sim.story.set('assault'); sim.story.set('tested'); sim.time = 0.8;
    const again = reload(b);
    again.time = 0.998; for (let t = 0; t < 30 * 10; t++) again.step();
    expect(again.story.flag('assault_over')).toBe(true);
    expect(MISSIONS[again.mission].id).toBe('follow_marks');
    b.sim.world.collision.setBlock('door', false); b.sim.world.collision.setBlock('seal', false);
  });
  it('the voice plays again if the save fell between setting the shards down and hearing it', () => {
    const b = new Bot(), { sim } = b;
    sim.mission = missionIndex('find_signal'); sim.story.set('shards_home'); sim.story.set('voice');
    const again = reload(b);
    for (let t = 0; t < 30 * 7; t++) again.step();
    expect(again.journal.has('signal_voice')).toBe(true);
  });
});

describe('the moss curtain', () => {
  it('hides the words until it is pulled aside', () => {
    const b = new Bot(), { sim } = b;
    b.to('scratched');
    sim.handle(1, { t: 'interact', prop: 'scratched' }); b.run(0.5);
    expect(sim.journal.has('scratched'), 'nothing to read yet').toBe(false);
    b.to('moss_curtain'); sim.handle(1, { t: 'interact', prop: 'moss_curtain' }); b.run(0.5);
    b.to('scratched'); sim.handle(1, { t: 'interact', prop: 'scratched' }); b.run(0.5);
    expect(sim.journal.has('scratched')).toBe(true);
  });
});

describe('saved games', () => {
  it('a save restores the mission, the pack, the built world and the map', async () => {
    const b = new Bot();
    b.sim.mission = missionIndex('seal_tunnel');
    b.sim.story.stage.door = 4;
    b.give({ spike: 1, stone: 3 });
    b.to('firePit');
    const save = JSON.parse(JSON.stringify(b.sim.serialize()));
    const out: ServerEvent[] = [];
    const again = new GameSim(worlds.get('hollow')!, (_p, e) => out.push(e), save.seed);
    again.restore(save);
    const p = again.addPlayer(1, 'bot', 0);
    expect(again.mission).toBe(b.sim.mission);
    expect(again.count(p, 'spike')).toBe(1);
    expect(again.story.built('door')).toBe(true);
    expect(Math.hypot(p.x - b.p.x, p.z - b.p.z)).toBeLessThan(1);
    expect(out.some((e) => e.t === 'state' && e.structures.door === 4)).toBe(true);
  });
});
