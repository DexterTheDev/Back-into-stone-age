/** Authoritative game simulation. Runs in a Web Worker for solo and in Node for co-op. */
import { createWorld, addEntity, addComponent, removeEntity } from 'bitecs';
import type RAPIER from '@dimforge/rapier3d-compat';
import { INVENTORY_SLOTS, ITEMS, RECIPES, recipeVisible, type ItemId, type WeaponDef } from '../data/items.ts';
import { PROPS } from '../data/props.ts';
import { Anim, SPECIES, type SpeciesId } from '../data/species.ts';
import { CLUES, MISSIONS, PHOTO_SUBJECTS, missionIndex, type MapId } from '../data/story.ts';
import type { ClientMsg, DinoSnap, FireSnap, InvSlot, MapSave, PlayerSave, PlayerSnap, SaveData, ServerEvent, Snapshot } from '../net/protocol.ts';
import { PF_CROUCH, PF_DEAD, PF_DOWNED, PF_LIGHT, PF_MOVING, PF_SPRINT, PF_TORCH, PF_WORKING } from '../net/protocol.ts';
import { Btn, PLAYER, type MoveState } from './movement.ts';
import { GRACE_FROM, GRACE_PACE, INPUT_DT, NIGHTFALL, PHASE, SLEEP_RATE, START_TIME, SUNSET_SECONDS, TICK_DT, clockRate, phaseName } from './time.ts';
import { FIRE_FEAR_RADIUS, hearNoise, setMode, stepDino, type Dino, type Pack } from './ai.ts';
import { Story } from './Story.ts';
import type { NavPoint } from './world.ts';
import { SimWorld } from './world.ts';

const Position = { x: new Float32Array(256), y: new Float32Array(256), z: new Float32Array(256) };
export const ITEM_INDEX = Object.keys(ITEMS) as ItemId[];

export interface SimPlayer extends MoveState {
  id: number; name: string; character: number; eid: number; collider: RAPIER.Collider;
  pitch: number; buttons: number; ack: number;
  health: number; hunger: number; thirst: number; heat: number; fear: number; bleeding: number; fracture: number;
  inv: (InvSlot | null)[]; held: number; lightOn: boolean; torch: boolean; battery: number;
  moving: boolean; sprinting: boolean; working: { until: number; done: () => void; noise: number; nextNoise: number; label: string } | null;
  downed: number; dead: boolean; deadAt: number; nearFire: boolean; lastGround: number; lastNoise: number;
  stress: number; lastSafe: NavPoint;
  fever: number; swingAt: number; scentUntil: number; lastVy: number; ready: boolean;
  ride: { path: NavPoint[]; i: number; speed: number; done: () => void } | null;
}

export interface SimFire { id: number; x: number; y: number; z: number; fuel: number; lit: boolean }

export type Outbound = (playerId: number | null, e: ServerEvent) => void;

/** Specialties, not locks: anyone can do anything, the specialist does it faster or quieter. */
export const CHARACTER = { Varga: 0, Okafor: 1, Hale: 2, Reyes: 3 } as const;

const CAVE_MARGIN = 2;
const SAVE_VERSION = 1;

export class GameSim {
  ecs = createWorld();
  clock = 0;
  tick = 0;
  time = START_TIME;
  weather = 0;
  tension = 0;
  players = new Map<number, SimPlayer>();
  dinos: Dino[] = [];
  packs: Pack[] = [];
  fires: SimFire[] = [];
  mission = 0;
  journal = new Set<string>();
  takenProps = new Set<string>();
  liveNodes = new Set<number>();
  private nextDino = 1;
  private nextPack = 1;
  private nextFire = 1;
  private scarState: 'none' | 'passing' | 'done' = 'none';
  private scarDusk = false;
  private pectinodonOut = false;
  private camp = false;
  private sunset: { at: number; rate: number } | null = null;
  story: Story;
  mapId: MapId = 'hollow';
  /** Supplied by the host: fetches and builds a map. */
  loadMap: ((id: MapId) => Promise<SimWorld>) | null = null;
  /** Host hook for storing a saved game. */
  onSave: ((data: SaveData) => void) | null = null;
  loading = false;
  ended = false;
  private mapStates: Partial<Record<MapId, MapSave>> = {};
  private smokes: { x: number; z: number; until: number }[] = [];
  private lastSave = -100;
  private nextDirector = 30;
  private nextAmbient = 40;
  private rng: () => number;

  constructor(public world: SimWorld, public out: Outbound, public seed: number) {
    let a = seed >>> 0;
    this.rng = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    this.rollNodes();
    this.story = new Story(this);
    this.applyWeather(0);
  }

  random() { return this.rng(); }

  /** Sessions randomise which resources are live. Tool-only ones are always there, or the story could stall. */
  private rollNodes() {
    this.liveNodes.clear();
    for (const n of this.world.blobs.meta.nodes) if (n.kind === 'pyrite' || n.kind === 'copper' || n.kind === 'bone' || this.rng() < 0.72) this.liveNodes.add(n.id);
  }

  // ---- players ------------------------------------------------------------------------------

  addPlayer(id: number, name: string, character: number) {
    const meta = this.world.blobs.meta;
    const saved = this.pendingPlayers.find((q) => q.character === character);
    if (saved) this.pendingPlayers = this.pendingPlayers.filter((q) => q !== saved);
    const s = saved ? { x: saved.x, y: saved.y, z: saved.z, yaw: saved.yaw } : this.mission > 0 ? this.joinPoint() : meta.spawns[this.players.size % meta.spawns.length];
    const eid = addEntity(this.ecs);
    addComponent(this.ecs, eid, Position);
    const p: SimPlayer = {
      id, name, character, eid, collider: this.world.collision.capsule(),
      x: s.x, y: s.y + 0.1, z: s.z, vx: 0, vy: 0, vz: 0, yaw: s.yaw, pitch: 0, grounded: false, crouched: false, stamina: 100,
      buttons: 0, ack: 0, health: 100, hunger: 88, thirst: 80, heat: 90, fear: 18, bleeding: 0, fracture: 0,
      inv: new Array(INVENTORY_SLOTS).fill(null), held: -1, lightOn: false, torch: false, battery: 100,
      moving: false, sprinting: false, working: null, downed: 0, dead: false, deadAt: 0, nearFire: false,
      lastGround: 0, lastNoise: 0, stress: 0, lastSafe: { x: s.x, y: s.y, z: s.z },
      fever: 0, swingAt: 0, scentUntil: 0, lastVy: 0, ready: true, ride: null,
    };
    this.players.set(id, p);
    if (saved) {
      Object.assign(p, { health: saved.health, hunger: saved.hunger, thirst: saved.thirst, heat: saved.heat, bleeding: saved.bleeding, fever: saved.fever, battery: saved.battery });
      for (let i = 0; i < p.inv.length; i++) p.inv[i] = saved.inv[i] ?? null;
      if (saved.inv.length > p.inv.length) for (const q of saved.inv.slice(p.inv.length)) if (q) this.give(p, q.id, q.n);
    } else this.give(p, 'canteen', 1);
    this.out(id, { t: 'welcome', you: id, seed: this.seed, nodes: [...this.liveNodes], time: this.time, mission: this.mission, map: this.mapId });
    this.sendState(id);
    this.sendInv(p);
    this.roster();
    this.story.resend();
    return p;
  }

  private pendingPlayers: PlayerSave[] = [];

  /** Friends joining a running session start at the safe zone. */
  private joinPoint() {
    const a = this.story.safeRespawn() ?? this.alive()[0] ?? this.world.blobs.meta.spawns[0];
    return { x: a.x + 1, y: a.y + 0.3, z: a.z + 1, yaw: 0 };
  }

  private sendState(id: number | null) {
    const st = this.story;
    this.out(id, { t: 'state', map: this.mapId, props: [...this.takenProps], shown: [...st.shown], journal: [...this.journal], sides: [...st.sides], structures: st.env.era ? {} : st.stagesHere(), open: { ...st.open }, fires: this.fires.map((f) => ({ id: f.id, x: f.x, y: f.y, z: f.z, lit: f.lit })) });
  }

  removePlayer(id: number) {
    const p = this.players.get(id);
    if (!p) return;
    removeEntity(this.ecs, p.eid);
    this.world.collision.world.removeCollider(p.collider, false);
    this.players.delete(id);
    this.roster();
  }

  private roster() { this.out(null, { t: 'roster', players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, character: p.character })) }); }
  alive() { return [...this.players.values()].filter((p) => !p.dead); }
  playerById(id: number) { return this.players.get(id) ?? null; }
  partySize() { return Math.max(1, this.players.size); }

  private sendInv(p: SimPlayer) { this.out(p.id, { t: 'inventory', slots: p.inv, held: p.held }); }
  count(p: SimPlayer, id: ItemId) { return p.inv.reduce((a, s) => a + (s?.id === id ? s.n : 0), 0); }

  give(p: SimPlayer, id: ItemId, n: number): boolean {
    const stack = ITEMS[id].stack;
    let left = n;
    for (const s of p.inv) if (s?.id === id && s.n < stack) { const k = Math.min(stack - s.n, left); s.n += k; left -= k; if (!left) break; }
    while (left > 0) {
      const free = p.inv.indexOf(null);
      if (free < 0) { this.out(p.id, { t: 'line', text: 'I cannot carry any more.' }); return false; }
      const k = Math.min(stack, left);
      p.inv[free] = { id, n: k, wear: ITEMS[id].tool ? 1 : undefined };
      left -= k;
    }
    this.sendInv(p);
    return true;
  }

  /** Returns false, taking nothing, when they do not have that many. */
  take(p: SimPlayer, id: ItemId, n: number) {
    if (this.count(p, id) < n) return false;
    let left = n;
    for (let i = 0; i < p.inv.length && left > 0; i++) {
      const s = p.inv[i];
      if (s?.id !== id) continue;
      const k = Math.min(s.n, left);
      s.n -= k; left -= k;
      if (s.n === 0) { p.inv[i] = null; if (p.held === i) p.held = -1; }
    }
    this.sendInv(p);
    return true;
  }

  work(p: SimPlayer, base: number, label: string, done: () => void, noise = 0) {
    if (p.working) return;
    const seconds = p.character === CHARACTER.Okafor ? base * 0.7 : base;
    p.working = { until: this.clock + seconds, done, noise, nextNoise: this.clock + 0.7, label };
    this.out(p.id, { t: 'work', seconds, label });
  }

  private cancelWork(p: SimPlayer) {
    if (!p.working) return;
    p.working = null;
    this.out(p.id, { t: 'work_done' });
  }

  // ---- messages ------------------------------------------------------------------------------

  handle(id: number, m: ClientMsg) {
    const p = this.players.get(id);
    if (!p) return;
    switch (m.t) {
      case 'input':
        if (m.seq > p.ack) { p.buttons = m.buttons; p.yaw = m.yaw; p.pitch = m.pitch; this.stepPlayer(p, m.seq); }
        break;
      case 'interact': if (!p.dead && !p.downed) this.interact(p, m); break;
      case 'craft': if (!p.dead && !p.downed) this.craft(p, m.id); break;
      case 'knap': if (!p.dead) this.finishKnap(p, m.hits, m.good); break;
      case 'hold': this.hold(p, m.slot); break;
      case 'light': if (this.count(p, 'flashlight') > 0 && p.battery > 0) { p.lightOn = m.on; this.sound('click', p.x, p.y + 1.4, p.z, 0.5); } break;
      case 'place_fire': this.placeFire(p); break;
      case 'feed_fire': this.feedFire(p, m.fire); break;
      case 'ignite': this.ignite(p, m.fire); break;
      case 'drink': this.drink(p); break;
      case 'chop': this.chop(p); break;
      case 'chat': this.out(null, { t: 'chat', from: p.name, text: m.text.slice(0, 200) }); break;
      case 'ping': this.out(null, { t: 'ping', kind: m.kind, x: m.x, y: m.y, z: m.z, from: id }); break;
      case 'revive': this.revive(p, m.target); break;
      case 'sleep': if (!m.on) this.cancelWork(p); break;
      case 'attack': if (!p.dead && !p.downed && !p.ride) this.attack(p); break;
      case 'use': if (!p.dead && !p.downed) this.useItem(p, m.slot); break;
      case 'move': this.moveItem(p, m.from, m.to); break;
      case 'drop': this.dropItem(p, m.slot); break;
      case 'act': if (!p.dead && !p.downed && !p.working && !p.ride) this.story.act(p, m.id); break;
      case 'fill': this.fillPot(p); break;
      case 'map_ready': p.ready = true; if ([...this.players.values()].every((q) => q.ready)) this.finishTravel(); break;
      case 'hello': break;
    }
  }

  noiseAt(p: SimPlayer | null, x: number, y: number, z: number, range: number) { this.noise(p, x, y, z, range); }

  private noise(p: SimPlayer | null, x: number, y: number, z: number, range: number) {
    if (range <= 0) return;
    if (p) this.out(p.id, { t: 'noise', x, y, z, range: range * this.noiseMult(x, z), by: p.id });
    for (const d of this.dinos) hearNoise(this, d, x, y, z, range);
  }

  /** Rain cuts every range about in half; caves make work echo further. */
  noiseMult(x: number, z: number) {
    return (this.weather > 0.5 ? 0.5 : 1) * (this.inCave(x, z) ? 1.25 : 1);
  }

  private inCave(x: number, z: number) {
    const m = this.world.blobs.meta.mouth;
    return x < m.x - CAVE_MARGIN && Math.hypot(x - m.x, z - m.z - 30) < 300 && this.world.blobs.meta.chambers.some((c) => Math.hypot(x - c.x, z - c.z) < 160);
  }

  indoors(p: SimPlayer) {
    return this.world.underRock(p.x, p.y, p.z);
  }

  // ---- interaction ------------------------------------------------------------------------------

  addClue(p: SimPlayer | null, id: string) {
    if (this.journal.has(id)) return false;
    this.journal.add(id);
    this.out(null, { t: 'journal', clue: id, by: p?.id ?? 0 });
    const c = CLUES[id];
    if (c?.line) this.out(null, { t: 'line', text: c.line, speaker: p?.id });
    return true;
  }

  private clue(p: SimPlayer, id: string) { const had = this.journal.has(id); this.story.clue(p, id); return !had; }

  takeProp(id: string) { this.takenProps.add(id); this.story.shown.delete(id); this.out(null, { t: 'prop_gone', id }); }

  private interact(p: SimPlayer, m: { node?: number; prop?: string }) {
    if (p.working) return;
    if (m.node !== undefined) {
      const n = this.world.blobs.meta.nodes[m.node];
      if (!n || !this.liveNodes.has(n.id) || Math.hypot(n.x - p.x, n.z - p.z) > 3.2) return;
      const table: Record<string, [ItemId, number, number, number, boolean?]> = {
        flint: ['flint', 1, 1.2, 0], branch: ['branch', 1, 1.0, 15], fiber: ['fiber', 2, 1.6, 0], tinder: ['tinder', 2, 1.4, 0], clay: ['clay', 1, 2.2, 0], stone: ['stone', 1, 1, 0],
        moss: ['moss', 2, 1.4, 0], bark: ['bark', 2, 1.8, 0], reed: ['reed', 2, 1.4, 0], bone: ['bone', 2, 1.6, 0],
        pyrite: ['pyrite', 1, 3.2, 30, true], copper: ['copper_ore', 2, 3.6, 30, true],
      };
      const [item, count, base, noise, pick] = table[n.kind];
      if (pick && this.count(p, 'stone_pick') < 1) { this.out(p.id, { t: 'line', text: 'I need a pick for this.' }); return; }
      // Varga reads the rock: quicker and cleaner at any seam.
      const secs = pick && p.character === CHARACTER.Varga ? base * 0.6 : base;
      this.work(p, secs, `Gathering ${ITEMS[item].name.toLowerCase()}`, () => {
        if (!this.liveNodes.delete(n.id)) return;
        this.out(null, { t: 'node_gone', id: n.id });
        this.give(p, item, count);
        if (noise) this.noise(p, n.x, n.y, n.z, noise);
        if (pick) this.wearItem(p, 'stone_pick', 0.1);
        this.afterGather(p);
        this.story.onGather(p, n.kind);
      }, pick ? 12 : 0);
      return;
    }
    if (m.prop) this.inspect(p, m.prop);
  }

  private inspect(p: SimPlayer, id: string) {
    const prop = this.world.blobs.meta.props.find((q) => q.id === id);
    const def = PROPS[id];
    if (!prop || !def || Math.hypot(prop.x - p.x, prop.z - p.z) > (def.reach ?? 4.5) + 0.8 || this.takenProps.has(id)) return;
    if (def.hidden && !this.story.shown.has(id)) return;
    const pick = (item: ItemId) => { if (this.give(p, item, 1)) this.takeProp(id); };
    switch (id) {
      case 'flashlight':
        pick('flashlight'); p.lightOn = true;
        this.sound('click', p.x, p.y + 1.4, p.z, 0.6);
        if (this.mission === 0) this.advance();
        break;
      case 'papers': pick('papers'); this.clue(p, 'papers'); break;
      case 'recorder': pick('recorder'); this.clue(p, 'recorder'); break;
      case 'compass':
        pick('compass'); this.clue(p, 'compass');
        if (p.character === CHARACTER.Varga) this.out(p.id, { t: 'line', text: 'Whatever pulls that needle is in this rock, and it is big.' });
        break;
      case 'radio': pick('radio'); this.clue(p, 'radio'); break;
      case 'array_case': case 'array_compressor': this.clue(p, 'array'); break;
      case 'dragmarks':
        this.clue(p, 'dragmarks');
        if (this.mission === 1) this.advance();
        break;
      case 'footprint':
        this.clue(p, 'footprint');
        if (this.mission === 3) { this.startScar(); }
        break;
      default: this.story.onProp(p, id); break;
    }
    if (id === 'papers') this.story.side('papers');
  }

  private afterGather(p: SimPlayer) {
    if (this.mission === 4 && this.count(p, 'flint') > 0) this.advance();
  }

  private craft(p: SimPlayer, id: ItemId) {
    const r = RECIPES.find((q) => q.id === id);
    if (!r || p.working || !recipeVisible(r, this.mission, this.journal)) return;
    for (const [k, n] of Object.entries(r.needs)) if (this.count(p, k as ItemId) < Math.max(1, n as number)) { this.out(p.id, { t: 'line', text: `I need ${ITEMS[k as ItemId].name.toLowerCase()}.` }); return; }
    if (r.station === 'knap') return; // knapping is its own mini-game, finished by a `knap` message
    if (r.station === 'fire' && !this.fireNear(p.x, p.z, 4.5)) { this.out(p.id, { t: 'line', text: 'That has to be done at a burning fire.' }); return; }
    if (r.station === 'furnace' && !this.nearFurnace(p)) { this.out(p.id, { t: 'line', text: 'That needs the furnace.' }); return; }
    this.work(p, r.seconds, r.label, () => {
      for (const [k, n] of Object.entries(r.needs)) if ((n as number) > 0 && !this.take(p, k as ItemId, n as number)) return;
      this.give(p, id, r.makes ?? 1);
      if (r.returns) this.give(p, r.returns, 1);
      if (id === 'hand_axe' && this.mission === 6) this.advance();
      this.story.onCraft(p, id);
    }, r.noise);
  }

  private nearFurnace(p: SimPlayer) { const f = this.world.blobs.meta.features.furnace; return !!f && this.story.built('furnace') && Math.hypot(f.x - p.x, f.z - p.z) < 6; }

  // ---- the pack ------------------------------------------------------------------------------

  private hold(p: SimPlayer, slot: number) {
    p.held = slot >= 0 && p.inv[slot] ? slot : -1;
    p.torch = p.held >= 0 && p.inv[p.held]?.id === 'torch';
    this.sendInv(p);
  }

  /** Swaps two pack slots. What is in the hand stays in the hand. */
  private moveItem(p: SimPlayer, from: number, to: number) {
    if (from === to || !p.inv[from] || to < 0 || to >= p.inv.length || from < 0) return;
    [p.inv[from], p.inv[to]] = [p.inv[to], p.inv[from]];
    if (p.held === from) p.held = to; else if (p.held === to) p.held = from;
    this.sendInv(p);
  }

  private dropItem(p: SimPlayer, slot: number) {
    const s = p.inv[slot];
    if (!s || ITEMS[s.id].key) return;
    p.inv[slot] = null;
    if (p.held === slot) { p.held = -1; p.torch = false; }
    this.sendInv(p);
  }

  private useItem(p: SimPlayer, slot: number) {
    const s = p.inv[slot], u = s && ITEMS[s.id].use;
    if (!s || !u || p.working) return;
    const id = s.id;
    this.work(p, u.seconds, u.label, () => {
      if (!this.take(p, id, 1)) return;
      if (u.hunger) p.hunger = Math.min(100, p.hunger + u.hunger);
      if (u.thirst) p.thirst = Math.min(100, p.thirst + u.thirst);
      const medic = p.character === CHARACTER.Hale ? 1.6 : 1;
      if (u.heal) p.health = Math.min(100, p.health + u.heal * medic);
      if (u.bleeding) p.bleeding = Math.max(0, p.bleeding - u.bleeding * medic);
      if (u.fever) p.fever = Math.max(0, p.fever - u.fever * medic);
      if (u.sick) this.sicken(p, u.sick);
      if (u.leaves) this.give(p, u.leaves, 1);
      this.story.onUse(p, id);
    });
  }

  private sicken(p: SimPlayer, amount: number) {
    p.fever = Math.min(100, p.fever + amount);
    if (p.fever > 20) this.clue(p, 'sick');
  }

  // ---- fighting ------------------------------------------------------------------------------

  private bestWeapon(p: SimPlayer) {
    let best = -1, top = 0;
    p.inv.forEach((s, i) => { const w = s && ITEMS[s.id].weapon; if (w && !w.ammo && w.damage > top) { top = w.damage; best = i; } });
    return best;
  }

  /** Left click. What it does depends on the hand. */
  private attack(p: SimPlayer) {
    if (p.working) return;
    const held = p.inv[p.held]?.id;
    if (held === 'camera') { if (this.clock > p.swingAt) { p.swingAt = this.clock + 1.2; this.story.photograph(p); } return; }
    if (held === 'recorder') { this.story.record(p); return; }
    if (held && ITEMS[held].use) { this.useItem(p, p.held); return; }
    if (!held || !ITEMS[held].weapon) {
      // Reaching for the weapon is automatic: in a fight there is no time to fumble.
      const slot = this.bestWeapon(p);
      if (slot < 0) return;
      this.hold(p, slot);
    }
    this.swing(p);
  }

  private swing(p: SimPlayer) {
    const s = p.inv[p.held]!, w = ITEMS[s.id].weapon as WeaponDef;
    if (this.clock < p.swingAt || p.stamina < 6) return;
    if (w.ammo && !this.take(p, w.ammo, 1)) { this.out(p.id, { t: 'line', text: 'Nothing left to fire.' }); return; }
    p.swingAt = this.clock + w.cooldown;
    p.stamina = Math.max(0, p.stamina - (w.ammo ? 2 : 6));
    this.sound(s.id === 'rifle' ? 'gunshot' : 'swing', p.x, p.y + 1.4, p.z, 1);
    this.noise(p, p.x, p.y + 1, p.z, w.noise);
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let target: Dino | null = null, best = 1e9;
    for (const d of this.dinos) {
      if (d.mode === 'dead') continue;
      const dx = d.x - p.x, dz = d.z - p.z, dist = Math.hypot(dx, dz);
      const reach = w.reach + d.radius + (SPECIES[d.species].reach > 5 ? 2 : 0.3);
      if (dist > reach) continue;
      const along = (dx * fx + dz * fz) / (dist || 1);
      const cone = w.reach > 6 ? 0.985 : 0.55;
      if (along < cone && dist > d.radius + 0.6) continue;
      if (dist < best && this.world.collision.clearLine(p.x, p.y + 1.3, p.z, d.x, d.y + 0.8, d.z)) { best = dist; target = d; }
    }
    if (target) {
      const hunter = p.character === CHARACTER.Reyes && (s.id === 'spike' || s.id === 'spear') ? 1.35 : 1;
      this.hurtDino(target, w.damage * hunter, p);
    }
    this.wearItem(p, s.id, w.wear);
  }

  private wearItem(p: SimPlayer, id: ItemId, amount: number) {
    const i = p.inv.findIndex((q) => q?.id === id), s = p.inv[i];
    if (!s || s.wear === undefined) return;
    s.wear -= amount;
    if (s.wear <= 0) {
      p.inv[i] = null;
      if (p.held === i) p.held = -1;
      this.out(p.id, { t: 'line', text: id === 'spike' ? 'The point snapped.' : 'The edge is gone.' });
    }
    this.sendInv(p);
  }

  /**
   * A weak weapon will not win a fight. It buys a second: the animal flinches off its bite, a badly hurt one
   * takes the whole pack back into the dark for a while, and enough blows kill the small ones outright.
   */
  hurtDino(d: Dino, damage: number, by: SimPlayer | null) {
    const sp = SPECIES[d.species];
    d.health -= damage;
    this.sound('hit', d.x, d.y + 1, d.z, 1);
    const killed = d.health <= 0;
    if (by) this.out(by.id, { t: 'hit', x: d.x, y: d.y + 1, z: d.z, killed });
    if (killed) {
      this.sound('raptor_call', d.x, d.y, d.z, 0.7);
      setMode(d, 'dead', this);
      d.despawnAt = this.clock + 25;
      if (d.pack) { d.pack.hurtUntil = this.clock + 24; d.pack.members = d.pack.members.filter((o) => o !== d); if (!d.pack.members.length) this.packs = this.packs.filter((q) => q !== d.pack); d.pack = null; }
      this.story.addCarcass(d);
      return;
    }
    if (sp.health > 800 && damage < 100) {
      if (by) this.out(by.id, { t: 'line', text: 'It did not even notice.' });
      d.alert = Math.max(d.alert, 3); d.lastHeard = { x: by?.x ?? d.x, y: by?.y ?? d.y, z: by?.z ?? d.z }; d.lastHeardAt = this.clock;
      return;
    }
    if (d.mode !== 'scripted') { setMode(d, 'flinch', this); }
    if (d.pack && d.health < sp.health * 0.5) d.pack.hurtUntil = this.clock + 18;
  }

  /** Each strike rings out about 25 m. Bad strikes waste the nodule. */
  private finishKnap(p: SimPlayer, hits: number, good: number) {
    if (this.count(p, 'flint') < 1) return;
    const strikes = Math.max(1, Math.min(8, Math.floor(hits)));
    for (let i = 0; i < strikes; i++) this.noise(p, p.x, p.y + 0.8, p.z, 25);
    this.sound('knap', p.x, p.y + 1, p.z);
    if (good >= 3) {
      this.take(p, 'flint', 1);
      this.give(p, 'blade', 1);
      if (this.mission === 5) this.advance();
    } else {
      this.take(p, 'flint', 1);
      this.out(p.id, { t: 'line', text: 'It shattered.' });
    }
  }

  private placeFire(p: SimPlayer) {
    if (p.working) return;
    if (this.count(p, 'tinder') < 2 || this.count(p, 'branch') + this.count(p, 'wood') < 3) { this.out(p.id, { t: 'line', text: 'I need tinder and wood to lay a fire.' }); return; }
    this.work(p, 5, 'Laying a fire', () => {
      this.take(p, 'tinder', 2);
      let n = 3;
      const w = Math.min(n, this.count(p, 'wood')); if (w) { this.take(p, 'wood', w); n -= w; }
      if (n) this.take(p, 'branch', n);
      const x = p.x - Math.sin(p.yaw) * 1.2, z = p.z - Math.cos(p.yaw) * 1.2;
      this.addFire(x, this.world.floorAt(x, p.y + 0.5, z), z);
    });
  }

  addFire(x: number, y: number, z: number, fuel = 0.6, lit = false) {
    const f: SimFire = { id: this.nextFire++, x, y, z, fuel, lit };
    this.fires.push(f);
    this.out(null, { t: 'fire', id: f.id, x, y, z, lit });
    return f;
  }

  private ignite(p: SimPlayer, id: number) {
    const f = this.fires.find((q) => q.id === id);
    if (!f || f.lit || Math.hypot(f.x - p.x, f.z - p.z) > 3.5) return;
    const striker = this.count(p, 'striker') > 0;
    if (!striker && this.count(p, 'bow_drill') < 1) { this.out(p.id, { t: 'line', text: 'The lighter is dry. I need a bow drill.' }); return; }
    // A burnt-out fire has nothing left in it to catch.
    if (f.fuel < 0.1) {
      const fuel: ItemId | null = this.count(p, 'wood') > 0 ? 'wood' : this.count(p, 'branch') > 0 ? 'branch' : null;
      if (!fuel) { this.out(p.id, { t: 'line', text: 'There is nothing left in it to burn. I need wood.' }); return; }
      this.take(p, fuel, 1);
      f.fuel = 0.3;
    }
    this.work(p, striker ? 2.5 : 9, striker ? 'Striking sparks' : 'Working the bow drill', () => {
      f.lit = true;
      this.out(null, { t: 'fire', id: f.id, x: f.x, y: f.y, z: f.z, lit: true });
      this.sound('ignite', f.x, f.y, f.z);
      this.clue(p, 'fire');
    }, striker ? 2 : 12);
  }

  private feedFire(p: SimPlayer, id: number) {
    const f = this.fires.find((q) => q.id === id);
    if (!f || Math.hypot(f.x - p.x, f.z - p.z) > 3.5) return;
    const item: ItemId | null = this.count(p, 'wood') > 0 ? 'wood' : this.count(p, 'branch') > 0 ? 'branch' : null;
    if (!item) return;
    this.take(p, item, 1);
    f.fuel = Math.min(1, f.fuel + (item === 'wood' ? 0.42 : 0.24));
    this.sound('feed', f.x, f.y, f.z);
  }

  private drink(p: SimPlayer) {
    const r = this.world.riverDistance(p.x, p.z);
    if (r.d > 3 || p.working) return;
    this.work(p, 2.5, 'Drinking', () => {
      p.thirst = Math.min(100, p.thirst + 45);
      this.sicken(p, this.mission === 9 ? 26 : 34);
      if (this.mission === 9) {
        this.advance();
        this.out(null, { t: 'line', text: p.character === CHARACTER.Hale ? 'Nobody else drinks that until it has been boiled.' : 'Hale would have my hide. Nobody drinks this again without boiling it.' });
      }
    });
  }

  private fillPot(p: SimPlayer) {
    if (this.world.riverDistance(p.x, p.z).d > 3.5 || p.working || this.count(p, 'pot') < 1) return;
    this.work(p, 2, 'Filling the pot', () => { if (this.take(p, 'pot', 1)) this.give(p, 'water_pot', 1); });
  }

  /** Hand-axe chopping: every hit carries about 40 m. */
  chop(p: SimPlayer) {
    if (p.working) return;
    if (p.inv[p.held]?.id !== 'hand_axe') {
      // Reaching for the axe is automatic: no need to fumble with the belt first.
      const slot = p.inv.findIndex((q) => q?.id === 'hand_axe');
      if (slot < 0) { this.out(p.id, { t: 'line', text: 'I need something to cut with.' }); return; }
      p.held = slot; this.sendInv(p);
    }
    const near: number[] = [];
    const n = this.world.grid.query(p.x, p.z, 3, near);
    let found = false;
    for (let i = 0; i < n; i += 4) if (Math.hypot(p.x - near[i], p.z - near[i + 1]) < near[i + 2] + 1.4 && near[i + 2] < 1.4 && Math.abs(near[i + 3] - p.y) < 6) found = true;
    if (!found) { this.out(p.id, { t: 'line', text: 'Nothing here worth cutting.' }); return; }
    const fell = this.mission >= missionIndex('door_materials');
    this.work(p, fell ? 7 : 4, fell ? 'Felling a pole' : 'Chopping', () => {
      this.give(p, 'wood', 2);
      if (fell) { this.give(p, 'pole', 1); this.noise(p, p.x, p.y, p.z, 80); }
      this.wearItem(p, 'hand_axe', fell ? 0.14 : 0.2);
    }, 40);
  }

  private revive(p: SimPlayer, id: number) {
    const t = this.players.get(id);
    if (!t || t.downed <= 0 || Math.hypot(t.x - p.x, t.z - p.z) > 2.5) return;
    this.work(p, 4, 'Getting them up', () => {
      if (t.downed <= 0) return;
      t.downed = 0; t.health = 30;
      if (this.mapId === 'valley' && this.mission >= missionIndex('first_shard')) this.story.side('trouble');
    });
  }

  /** Sleep is only ever safe with everyone asleep. Moving wakes you. */
  sleep(p: SimPlayer) {
    if (p.working) return;
    if (this.time > 0.04 && this.time < 0.5) { this.out(p.id, { t: 'line', text: 'I cannot sleep in daylight.' }); return; }
    if (this.story.flag('assault') && !this.story.flag('assault_over')) { this.out(p.id, { t: 'line', text: 'Not tonight.' }); return; }
    const left = this.time >= 0.5 ? 1 - this.time + 0.06 : 0.06 - this.time;
    const seconds = Math.max(4, left / (clockRate(this.time) * SLEEP_RATE));
    this.work(p, seconds, 'Sleeping', () => {
      p.health = Math.min(100, p.health + 25); p.fever = Math.max(0, p.fever - 30); p.fear = 0; p.bleeding = 0;
      this.autosave();
    });
  }

  // ---- riding ------------------------------------------------------------------------------

  /** Ladders, ropes and the raft: the player is carried along a path, in view but not in control. */
  ride(p: SimPlayer, path: NavPoint[], speed: number, done: () => void) {
    if (p.ride || p.working) return;
    p.ride = { path, i: 0, speed, done };
    p.vx = p.vy = p.vz = 0;
  }

  private stepRide(p: SimPlayer, dt: number) {
    const r = p.ride!;
    const next = r.path[r.i];
    if (!next) { p.ride = null; r.done(); return; }
    const dx = next.x - p.x, dy = next.y - p.y, dz = next.z - p.z, d = Math.hypot(dx, dy, dz), step = r.speed * dt;
    if (d <= step) { p.x = next.x; p.y = next.y; p.z = next.z; r.i++; } else { p.x += (dx / d) * step; p.y += (dy / d) * step; p.z += (dz / d) * step; }
    p.grounded = false;
    if (p.collider) p.collider.setTranslation({ x: p.x, y: p.y + PLAYER.halfHeight + PLAYER.radius, z: p.z });
  }

  // ---- maps ------------------------------------------------------------------------------

  private holdMap(): MapSave {
    return { nodes: [...this.liveNodes], fires: this.fires.map((f) => ({ x: f.x, y: f.y, z: f.z, fuel: f.fuel, lit: f.lit })) };
  }

  /** Everyone goes together. The host loads the map, the clients follow, and the world waits for them. */
  travel(map: MapId, entry: string, then?: () => void) {
    if (this.loading) return;
    this.mapStates[this.mapId] = this.holdMap();
    this.loading = true;
    for (const p of this.players.values()) { p.ride = null; this.cancelWork(p); }
    const go = (world: SimWorld) => {
      for (const p of this.players.values()) this.world.collision.world.removeCollider(p.collider, false);
      this.world = world;
      this.mapId = map;
      this.dinos = []; this.packs = []; this.fires = []; this.smokes = [];
      const st = this.mapStates[map];
      if (st) { this.liveNodes = new Set(st.nodes); for (const f of st.fires) { this.fires.push({ id: this.nextFire++, x: f.x, y: f.y, z: f.z, fuel: f.fuel, lit: f.lit }); } } else this.rollNodes();
      const f = world.blobs.meta.features[entry] ?? world.blobs.meta.spawns[0];
      let i = 0;
      for (const p of this.players.values()) {
        p.collider = world.collision.capsule();
        p.x = f.x + (i % 2) * 1.5; p.y = f.y + 0.6; p.z = f.z + ((i >> 1) % 2) * 1.5; p.vx = p.vy = p.vz = 0; i++;
        p.ready = false;
      }
      const yaw = (f as { yaw?: number }).yaw ?? 0;
      this.out(null, { t: 'map', id: map, x: f.x, y: f.y + 0.6, z: f.z, yaw });
      this.out(null, { t: 'welcome', you: 0, seed: this.seed, nodes: [...this.liveNodes], time: this.time, mission: this.mission, map });
      this.sendState(null);
      this.story.onMapEntered(map);
      then?.();
      // No clients at all, as in tests: nothing to wait for.
      if (!this.waitForClients) { for (const p of this.players.values()) p.ready = true; this.finishTravel(); }
    };
    if (this.loadMap) void this.loadMap(map).then(go); else go(this.world);
  }

  /** Off in simulation tests, where nobody is loading anything. */
  waitForClients = true;

  private finishTravel() { this.loading = false; this.story.resend(); }

  // ---- saved games ------------------------------------------------------------------------------

  /** Written at every safe point: new objectives, sleeping, arriving somewhere. */
  autosave(force = false) {
    if (!this.onSave || this.ended || this.story.env.era || (!force && this.clock - this.lastSave < 2)) return;
    this.lastSave = this.clock;
    this.onSave(this.serialize());
  }

  serialize(): SaveData {
    this.mapStates[this.mapId] = this.holdMap();
    return {
      v: SAVE_VERSION, map: this.mapId, time: this.time, mission: this.mission, seed: this.seed, taken: [...this.takenProps], journal: [...this.journal],
      story: this.story.serial(), maps: { ...this.mapStates } as Record<string, MapSave>,
      players: [...this.players.values()].map((p) => ({ character: p.character, x: p.x, y: p.y, z: p.z, yaw: p.yaw, health: Math.max(p.health, 35), hunger: p.hunger, thirst: p.thirst, heat: p.heat, bleeding: p.bleeding, fever: p.fever, battery: p.battery, inv: p.inv })),
    };
  }

  /** Runs before any player joins. The world for `save.map` must already be loaded. */
  restore(s: SaveData) {
    if (s.v !== SAVE_VERSION) return;
    this.mapId = s.map as MapId;
    this.time = s.time; this.mission = s.mission;
    this.journal = new Set(s.journal);
    this.takenProps = new Set(s.taken);
    for (const [k, v] of Object.entries(s.maps)) this.mapStates[k as MapId] = v;
    const st = this.mapStates[this.mapId];
    if (st) { this.liveNodes = new Set(st.nodes); this.fires = st.fires.map((f) => ({ id: this.nextFire++, ...f })); }
    this.story.restore(s.story);
    this.pendingPlayers = s.players;
    this.scarState = this.mission >= 4 ? 'done' : 'none';
    this.camp = this.mission >= 3;
    this.story.applyMapBlocks();
    this.story.populate();
  }

  // ---- missions ------------------------------------------------------------------------------

  advance() {
    this.mission = Math.min(this.mission + 1, MISSIONS.length - 1);
    this.out(null, { t: 'mission', index: this.mission });
    this.story.onMission(this.mission);
  }

  advanceTo(index: number) {
    this.mission = index;
    this.out(null, { t: 'mission', index });
    this.story.onMission(index);
  }

  /** The sky goes dark ahead of its time, when the story needs it to. */
  bringDark() {
    if (this.time >= NIGHTFALL && this.time < 0.98) return;
    const from = this.time < NIGHTFALL ? this.time : 0;
    this.sunset = { at: this.clock, rate: (NIGHTFALL - from) / SUNSET_SECONDS };
  }

  /** The kill's owner on its way back. */
  scarAt(p: SimPlayer, line: string) {
    this.out(null, { t: 'line', text: line });
    this.scarPass(p);
  }

  private stepMissions() {
    const meta = this.world.blobs.meta;
    const f = meta.features;
    const players = this.alive();
    if (this.mission === 1 && players.length > 1) {
      const a = players[0];
      if (players.every((p) => Math.hypot(p.x - a.x, p.z - a.z) < 14)) this.advance();
    }
    if (this.mission === 2 && players.some((p) => p.x > meta.mouth.x + 14)) {
      this.advance();
      this.out(null, { t: 'line', text: 'That is not Montana.' });
    }
    if (this.mission === 3 && !this.camp && players.some((p) => Math.hypot(p.x - f.campSite.x, p.z - f.campSite.z) < 42)) {
      this.camp = true;
      this.journal.add('noriver');
      this.out(null, { t: 'journal', clue: 'noriver', by: players[0].id });
      this.out(null, { t: 'line', text: 'This is where the camp was.' });
    }
    // The first fire brings the dark on. The objective waits until the sky agrees with it.
    if (this.mission === 7 && !this.sunset && this.time < NIGHTFALL && this.fires.some((q) => q.lit)) {
      this.sunset = { at: this.clock, rate: (NIGHTFALL - this.time) / SUNSET_SECONDS };
      this.out(null, { t: 'line', text: 'The sun should not be dropping that fast.' });
    }
    if (this.mission < 8 && this.mission >= 3 && this.time >= NIGHTFALL) {
      this.mission = 8;
      this.out(null, { t: 'mission', index: 8 });
    }
    if (this.mission === 8 && this.time < 0.03 && this.clock > 200) this.advance();
    this.story.tick();
  }

  /** Old Scar: heard often, seen twice. This is the first time. */
  private startScar() {
    if (this.scarState !== 'none') return;
    this.scarState = 'passing';
    const f = this.world.blobs.meta.features;
    const fy = this.world.terrainAt(f.campSite.x + 120, f.campSite.z - 60);
    const pts: NavPoint[] = [
      { x: f.campSite.x + 80, y: fy, z: f.campSite.z - 110 }, { x: f.campSite.x + 40, y: fy, z: f.campSite.z - 62 },
      { x: f.campSite.x - 60, y: fy, z: f.campSite.z - 70 }, { x: f.campSite.x - 170, y: fy, z: f.campSite.z - 150 },
    ];
    const d = this.spawn('trex', pts[0], null);
    d.mode = 'scripted';
    d.script = { points: pts, i: 1, roared: false, speed: 3.2 };
    this.sound('trex_roar', pts[1].x, fy + 5, pts[1].z, 1);
    this.fearAll(25);
    this.advance();
  }

  /** A pass through the tree line at a distance, out of reach but close enough to feel. */
  private scarPass(p: SimPlayer) {
    const a = this.rng() * 6.283, c = Math.cos(a), s = Math.sin(a), r = 95;
    const at = (t: number) => { const x = p.x + c * r - s * t, z = p.z + s * r + c * t; return { x, y: this.world.terrainAt(x, z), z }; };
    const d = this.spawn('trex', at(-150), null);
    d.mode = 'scripted';
    d.script = { points: [at(-60), at(40), at(160)], i: 0, roared: false, speed: 3 };
    this.sound('trex_far', at(0).x, at(0).y + 5, at(0).z, 1);
    this.fearAll(14);
  }

  endScript(d: Dino) {
    d.script = undefined;
    this.scarState = 'done';
    this.despawn(d);
  }

  // ---- creatures ------------------------------------------------------------------------------

  spawn(species: SpeciesId, at: NavPoint, pack: Pack | null): Dino {
    const sp = SPECIES[species];
    const d: Dino = {
      id: this.nextDino++, species, speciesIndex: Object.keys(SPECIES).indexOf(species), x: at.x, y: at.y, z: at.z, yaw: 0, speed: 0,
      anim: Anim.Idle, health: sp.health, mode: 'patrol', modeTime: 0, pack, goal: null, path: [], pathAt: 0, thinkAt: this.clock + Math.random(),
      alert: 0, lastHeard: null, lastHeardAt: 0, hits: 0, biteAt: 0, angle: Math.random() * 6, radius: sp.radius, flags: 0, despawnAt: null, blocked: 0, home: null, warned: 0,
    };
    this.dinos.push(d);
    if (pack) pack.members.push(d);
    return d;
  }

  /** A pack sent somewhere on purpose: at the door, into the tunnel, up the ridge. */
  spawnPackAt(species: SpeciesId, size: number, x: number, z: number, intent: 'door' | 'seal' | 'hunt' | 'prowl' | 'nest') {
    const f = this.world.blobs.meta.features;
    const n = f.nest ?? { x, y: 0, z };
    const pack: Pack = { id: this.nextPack++, members: [], target: null, known: null, knownAt: 0, nextProbe: this.clock + 12, memory: [], home: { x: n.x, y: n.y, z: n.z }, hurtUntil: 0 };
    this.packs.push(pack);
    const goal = intent === 'door' ? f.door : intent === 'seal' ? f.seal : this.alive()[0];
    for (let i = 0; i < size; i++) {
      const px = x + (this.rng() - 0.5) * 9, pz = z + (this.rng() - 0.5) * 9;
      const d = this.spawn(species, { x: px, y: this.world.floorAt(px, (goal?.y ?? 80) + 6, pz), z: pz }, pack);
      if (intent === 'door' || intent === 'seal' || intent === 'hunt') { d.mode = 'stalk'; }
      if (intent === 'nest') { d.mode = 'rest'; }
    }
    if (goal && intent !== 'nest' && intent !== 'prowl') { pack.known = { x: goal.x, y: goal.y, z: goal.z }; pack.knownAt = this.clock + 60; }
    return pack;
  }

  spawnSolo(species: SpeciesId, x: number, z: number) {
    const f = this.world.blobs.meta.features.nest ?? { x, y: 0, z };
    const pack: Pack = { id: this.nextPack++, members: [], target: null, known: null, knownAt: 0, nextProbe: this.clock + 10, memory: [], home: { x: f.x, y: f.y, z: f.z }, hurtUntil: 0 };
    this.packs.push(pack);
    return this.spawn(species, { x, y: this.world.terrainAt(x, z), z }, pack);
  }

  huntPlayer(d: Dino, p: SimPlayer) {
    if (d.pack) { d.pack.target = p.id; d.pack.known = { x: p.x, y: p.y, z: p.z }; d.pack.knownAt = this.clock + 40; }
    d.mode = 'stalk'; d.path = [];
  }

  clearHunters() {
    for (const d of [...this.dinos]) if (SPECIES[d.species].role === 'pack' || SPECIES[d.species].role === 'apex' || SPECIES[d.species].role === 'swarm') this.despawn(d);
  }

  clearAll() { this.dinos = []; this.packs = []; }

  fearAll(amount: number) { for (const p of this.alive()) this.fearSpike(p, amount); }

  /** Green fronds on an ember: nothing can see or smell through it for a while. */
  smoke(p: SimPlayer) {
    this.smokes.push({ x: p.x, z: p.z, until: this.clock + 22 });
    this.out(null, { t: 'sound', id: 'feed', x: p.x, y: p.y, z: p.z, volume: 1 });
    for (const d of this.dinos) if (d.pack && Math.hypot(d.x - p.x, d.z - p.z) < 14) { d.pack.known = null; setMode(d, 'retreat', this); d.modeTime = -8; }
  }

  inSmoke(p: { x: number; z: number }) { return this.smokes.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 7); }

  /** What the Polaroid caught: the largest thing near the centre of frame, or the place itself. */
  subjectInView(p: SimPlayer): string | null {
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let best: Dino | null = null, score = 0;
    for (const d of this.dinos) {
      if (d.mode === 'dead') continue;
      const dx = d.x - p.x, dz = d.z - p.z, dist = Math.hypot(dx, dz);
      if (dist > 70) continue;
      const along = (dx * fx + dz * fz) / (dist || 1);
      if (along < 0.86) continue;
      const k = along * (1 - dist / 90);
      if (k > score && this.world.collision.clearLine(p.x, p.y + 1.5, p.z, d.x, d.y + 1, d.z)) { score = k; best = d; }
    }
    if (best) return best.species;
    const f = this.world.blobs.meta.features;
    if (this.mapId === 'hollow' && f.array && Math.hypot(f.array.x - p.x, f.array.z - p.z) < 20) return 'array_site';
    if (this.mapId === 'ridge' && f.array && Math.hypot(f.array.x - p.x, f.array.z - p.z) < 30) return 'ring_site';
    return null;
  }
  private herd: { goal: number; at: number } = { goal: 0, at: 0 };
  /** Which of the herd's stops it should be heading for at this hour. */
  herdGoal(): NavPoint | null {
    const f = this.world.blobs.meta.features;
    if (!f.herd_a) return null;
    const t = this.time;
    return t < 0.2 ? f.herd_a : t < 0.42 ? f.herd_b : f.herd_c;
  }
  herdInit() { this.herd.at = this.clock; }
  stampede(from: NavPoint) { for (const d of this.dinos) if (SPECIES[d.species].role === 'herd' && d.mode !== 'dead') { d.mode = 'flee'; d.modeTime = 0; d.goal = { x: d.x + (d.x - from.x) * 3, y: d.y, z: d.z + (d.z - from.z) * 3 }; d.path = []; } }

  /** The last hour. Everyone dies where they stand, at once and in first person. */
  tooLate() {
    this.sound('thunder', 0, 200, 0, 1);
    this.sunset = null;
    this.out(null, { t: 'line', text: 'The whole sky went white.' });
  }

  despawn(d: Dino) {
    this.dinos = this.dinos.filter((o) => o !== d);
    if (d.pack) { d.pack.members = d.pack.members.filter((o) => o !== d); if (!d.pack.members.length) this.packs = this.packs.filter((p) => p !== d.pack); }
  }

  /** A pack enters from out of sight. It never spawns where a player can see it. */
  private spawnPack(species: SpeciesId, size: number) {
    const meta = this.world.blobs.meta;
    const n = meta.features.nest ?? meta.spawns[0];
    const pack: Pack = { id: this.nextPack++, members: [], target: null, known: null, knownAt: 0, nextProbe: this.clock + 20, memory: [], home: { x: n.x, y: n.y, z: n.z }, hurtUntil: 0 };
    this.packs.push(pack);
    const lead = this.alive()[0];
    const anchor = lead ?? { x: 0, z: 0 };
    const dir = Math.atan2(n.z - anchor.z, n.x - anchor.x);
    for (let i = 0; i < size; i++) {
      for (let t = 0; t < 12; t++) {
        const r = 150 + t * 10, a = dir + (this.rng() - 0.5) * 0.7;
        const x = anchor.x + Math.cos(a) * r, z = anchor.z + Math.sin(a) * r, y = this.world.terrainAt(x, z);
        if (this.alive().every((p) => !this.world.collision.clearLine(p.x, p.y + 1.6, p.z, x, y + 1, z) || Math.hypot(p.x - x, p.z - z) > 120)) {
          const d = this.spawn(species, { x, y, z }, pack);
          d.goal = { x: anchor.x, y: 0, z: anchor.z };
          break;
        }
      }
    }
  }

  patrolPoint(d: Dino): NavPoint {
    const a = this.rng() * 6.283, r = 40 + this.rng() * 70;
    const near = this.alive()[0];
    const cx = near && d.species !== 'trex' ? near.x : d.x, cz = near && d.species !== 'trex' ? near.z : d.z;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    return { x, y: this.world.terrainAt(x, z), z };
  }

  /** Light that can be seen from far off at night: fires, and players with lights outdoors. */
  brightestGlow(d: Dino): NavPoint | null {
    if (this.nightness() < 0.3) return null;
    for (const f of this.fires) if (f.lit && !this.story.fireHidden(f.x) && Math.hypot(f.x - d.x, f.z - d.z) < 260) return { x: f.x, y: f.y, z: f.z };
    const fu = this.world.blobs.meta.features.furnace;
    if (fu && this.story.flag('glow') && Math.hypot(fu.x - d.x, fu.z - d.z) < 900) return { x: fu.x, y: fu.y, z: fu.z };
    for (const p of this.alive()) if ((p.lightOn || p.torch) && !this.indoors(p) && Math.hypot(p.x - d.x, p.z - d.z) < 120) return { x: p.x, y: p.y, z: p.z };
    return null;
  }

  fireNear(x: number, z: number, r: number) {
    for (const f of this.fires) if (f.lit && Math.hypot(f.x - x, f.z - z) < r) return f;
    return null;
  }

  ambientLight(p: SimPlayer) {
    const n = this.nightness();
    const outside = this.indoors(p) ? 0.04 : 1;
    return outside * (1 - n * 0.93);
  }

  /** 0 at noon, 1 at midnight. */
  nightness() {
    const name = phaseName(this.time);
    if (name === 'day') return 0;
    if (name === 'night') return 1;
    if (name === 'dusk') return (this.time - 0.55) / 0.075;
    return 1 - this.time / 0.05;
  }

  /** Fern beds hide you; open ground does not. */
  coverAt(p: SimPlayer) {
    return p.crouched && !this.indoors(p) ? 0.55 : 1;
  }

  fearSpike(p: SimPlayer, amount: number) { p.fear = Math.min(100, p.fear + amount); }

  sound(id: string, x: number, y: number, z: number, volume = 1) { this.out(null, { t: 'sound', id, x, y, z, volume }); }

  hurtPlayer(p: SimPlayer, damage: number, d: Dino) {
    if (p.dead) return;
    p.health -= damage;
    p.bleeding = Math.min(100, p.bleeding + 18);
    this.fearSpike(p, 30);
    this.sound('bite', p.x, p.y + 1, p.z);
    if (p.health <= 0) {
      p.health = 0;
      if (this.alive().length > 1 && SPECIES[d.species].damage < 200 && p.downed === 0) { p.downed = 45; return; }
      this.kill(p, d.species, `Taken by ${SPECIES[d.species].name}`);
    }
  }

  kill(p: SimPlayer, killer: string, cause: string) {
    p.dead = true; p.deadAt = this.clock; p.lightOn = false; p.torch = false; p.downed = 0;
    this.cancelWork(p);
    this.out(null, { t: 'death', player: p.id, killer, seed: Math.floor(this.rng() * 1e6), x: p.x, y: p.y, z: p.z, cause });
  }

  private respawn(p: SimPlayer) {
    const meta = this.world.blobs.meta;
    const f = this.fires.find((q) => q.lit);
    const at = this.story.safeRespawn() ?? (f ? { x: f.x + 1.6, y: f.y + 0.1, z: f.z } : meta.spawns[Math.min(1, meta.spawns.length - 1)]);
    Object.assign(p, { x: at.x, y: at.y, z: at.z, vx: 0, vy: 0, vz: 0, dead: false, health: 62, bleeding: 0, fear: 40, stamina: 60 });
    this.out(null, { t: 'respawn', player: p.id });
  }

  // ---- ticking ------------------------------------------------------------------------------

  private stepPlayer(p: SimPlayer, seq: number) {
    p.ack = seq;
    if (p.dead || p.ride) return;
    let buttons = p.buttons;
    if (p.downed > 0) buttons = 0;
    if (p.working) {
      if (buttons & (Btn.Forward | Btn.Back | Btn.Left | Btn.Right)) this.cancelWork(p);
      else buttons = 0;
    }
    const falling = p.vy;
    const wasGrounded = p.grounded;
    const r = this.world.collision.step(p.collider, p, buttons, p.yaw, INPUT_DT, this.moveScale(p));
    p.moving = r.moving; p.sprinting = r.sprinting;
    if (!wasGrounded && p.grounded && falling < -13) this.fall(p, -falling);
    // Nothing should ever fall below the valley floor. If it does, put them back on the surface.
    if (p.y < 8 || (p.vy < -9 && this.world.collision.raycastDown(p.x, p.y, p.z, 80) === null)) { p.y = this.world.terrainAt(p.x, p.z) + 0.5; p.vy = 0; }
    Position.x[p.eid] = p.x; Position.y[p.eid] = p.y; Position.z[p.eid] = p.z;

    // Movement sound: careful movement is safe, careless running is not.
    if (p.moving && this.clock - p.lastNoise > 0.4) {
      p.lastNoise = this.clock;
      let range = p.crouched ? 0 : 3;
      if (p.sprinting) range = this.onLoudGround(p) ? 20 : 10;
      if (p.character === CHARACTER.Reyes) range *= 0.7;
      if (range) this.noise(p, p.x, p.y, p.z, range);
    }
  }

  /** Hard landings hurt, and the worst of them break something. */
  private fall(p: SimPlayer, speed: number) {
    const damage = (speed - 13) * 7;
    p.health -= damage;
    this.noise(p, p.x, p.y, p.z, 15);
    if (speed > 17) p.fracture = 100;
    if (p.health <= 0) { p.health = 0; this.kill(p, 'fall', 'A long fall'); }
  }

  /** Injury, cold and hunger all slow you down. Sent to the client so prediction agrees. */
  private moveScale(p: SimPlayer) {
    return (p.fracture > 0 ? 0.6 : 1) * (p.heat < 25 ? 0.85 : 1) * (p.hunger < 12 ? 0.9 : 1) * (p.fever > 60 ? 0.9 : 1);
  }

  /** Gravel, shallows, and everywhere on the ash fields. */
  private onLoudGround(p: SimPlayer) {
    return this.mapId === 'ridge' || this.world.riverDistance(p.x, p.z).d < 12;
  }

  /** The sun keeps the cycle's own pace, unless the story needs it somewhere else. */
  private stepClock(dt: number) {
    let rate = clockRate(this.time);
    const everyone = this.alive();
    if (everyone.length && everyone.every((p) => p.working?.label === 'Sleeping')) rate *= SLEEP_RATE;
    if (this.sunset) rate = Math.max(rate, this.sunset.rate * Math.min(1, (this.clock - this.sunset.at) / 3));
    else if (this.mission < 7 && this.time >= GRACE_FROM && this.time < PHASE.dayEnd) rate *= GRACE_PACE;
    if (this.story.ending === 'last_one' && this.time > 0.8) rate = 0;
    const next = this.time + rate * dt;
    if (next >= 1) this.story.counters.days = (this.story.counters.days ?? 0) + 1;
    this.time = next % 1;
    if (this.sunset && this.time >= NIGHTFALL) this.sunset = null;
    this.stepWeather(dt);
  }

  private rainAt = 300;
  private rainUntil = 0;

  /** Flash rain: everything hears less, everyone gets colder, and the side tunnels fill. */
  private stepWeather(dt: number) {
    if (this.clock > this.rainAt) { this.rainUntil = this.clock + 70 + this.rng() * 90; this.rainAt = this.rainUntil + 240 + this.rng() * 360; }
    const storm = this.story.env.storm;
    const want = Math.max(this.clock < this.rainUntil ? 1 : 0, storm);
    this.applyWeather(this.weather + (want - this.weather) * Math.min(1, dt * 0.25));
  }

  private applyWeather(v: number) { this.weather = v; }

  step() {
    if (this.loading) return;
    this.tick++;
    this.clock += TICK_DT;
    const dt = TICK_DT;
    this.stepClock(dt);
    const night = this.nightness();
    this.smokes = this.smokes.filter((s) => s.until > this.clock);

    for (const f of this.fires) {
      if (!f.lit) continue;
      f.fuel -= dt / 300;
      if (f.fuel <= 0) { f.fuel = 0; f.lit = false; this.out(null, { t: 'fire', id: f.id, x: f.x, y: f.y, z: f.z, lit: false }); }
    }

    for (const p of this.players.values()) {
      if (p.dead) {
        if (this.clock - p.deadAt > 60 || (this.alive().length === 0 && this.clock - p.deadAt > 7)) this.respawn(p);
        continue;
      }
      if (p.ride) this.stepRide(p, dt);
      if (p.working) {
        const w = p.working;
        if (w.noise && this.clock > w.nextNoise) { w.nextNoise = this.clock + 1.1; this.noise(p, p.x, p.y + 0.8, p.z, w.noise); }
        if (this.clock >= w.until) { p.working = null; this.out(p.id, { t: 'work_done' }); w.done(); }
      }
      if (p.lightOn) {
        p.battery -= dt / 14;
        if (p.battery <= 0) { p.battery = 0; p.lightOn = false; this.out(p.id, { t: 'line', text: 'That was the last of the batteries.' }); }
      }
      if (p.downed > 0) {
        p.downed -= dt;
        if (p.downed <= 0) this.kill(p, 'bleed', 'Bled out');
        continue;
      }
      p.nearFire = this.fireNear(p.x, p.z, 7) !== null;
      const indoors = this.indoors(p);
      const work = p.working ? 1.4 : 1;
      p.hunger = Math.max(0, p.hunger - (dt / 34) * work);
      p.thirst = Math.max(0, p.thirst - (dt / 28) * work);
      const coldRate = (night * 0.35 + (indoors ? 0 : night * 0.3) + this.weather * 0.25);
      p.heat = p.nearFire ? Math.min(100, p.heat + dt * 1.2) : Math.max(0, Math.min(100, p.heat + dt * (0.1 - coldRate)));
      if (p.thirst === 0 || p.heat === 0) p.health -= dt * 0.4;
      if (p.fever > 0) { p.fever = Math.max(0, p.fever - dt * 0.18); if (p.fever > 50) p.health -= dt * 0.06; }
      if (p.fracture > 0) p.fracture = Math.max(0, p.fracture - dt * 0.4);
      this.stepWater(p, dt);
      if (p.bleeding > 0) { p.health -= dt * p.bleeding * 0.012; p.bleeding = Math.max(0, p.bleeding - dt * (p.character === CHARACTER.Hale ? 1.6 : 0.8)); }
      if (p.health < 100 && p.bleeding === 0 && p.hunger > 30 && p.thirst > 30) p.health = Math.min(100, p.health + dt * 0.08);
      if (p.health <= 0) { p.health = 0; this.kill(p, 'bleed', 'Bled out'); continue; }
      // Fear: darkness, solitude, what is near.
      let threat = 0;
      for (const d of this.dinos) { const q = Math.hypot(d.x - p.x, d.z - p.z); if (q < 45) threat = Math.max(threat, 1 - q / 45); }
      const dark = (p.lightOn || p.torch || p.nearFire) ? 0 : this.ambientLight(p) < 0.25 ? 0.35 : 0;
      p.fear = Math.max(0, Math.min(100, p.fear + dt * (threat * 7 + dark - (p.nearFire ? 2.2 : 0.9))));
      if (Math.hypot(p.x - p.lastSafe.x, p.z - p.lastSafe.z) > 2 && p.nearFire) p.lastSafe = { x: p.x, y: p.y, z: p.z };
    }

    for (const d of [...this.dinos]) {
      if (d.despawnAt !== null && this.clock > d.despawnAt) { this.despawn(d); continue; }
      stepDino(this, d, dt);
    }
    this.stepMissions();
    this.director();
  }

  /** Rising water in the side tunnels: wade out, or drown in it. */
  private stepWater(p: SimPlayer, dt: number) {
    const meta = this.world.blobs.meta;
    if (this.weather < 0.6 || p.y > meta.tunnelWaterY + 1.1 || !this.indoors(p)) return;
    p.heat = Math.max(0, p.heat - dt * 2);
    p.health -= dt * 1.4;
    if (p.health <= 0) { p.health = 0; this.kill(p, 'drown', 'Drowned in the tunnel'); }
  }

  /**
   * Pacing. Watches stress and progress. After a big scare it eases off; when players get
   * comfortable it sends a patrol, a sound cue or a false alarm. It never spawns in view.
   */
  private director() {
    const players = this.alive();
    if (!players.length) return;
    const nearest = Math.min(...this.dinos.map((d) => Math.min(...players.map((p) => Math.hypot(p.x - d.x, p.z - d.z)))), 200);
    const pressure = Math.max(0, 1 - nearest / 80);
    const stress = Math.max(...players.map((p) => p.fear)) / 100;
    this.tension += (Math.max(pressure, stress * 0.8) - this.tension) * 0.01;

    const dusk = this.time > 0.55;
    if (this.story.env.era || this.ended) return;
    if (dusk && this.time < 0.98 && this.packs.length === 0) {
      const party = this.partySize();
      this.spawnPack('raptor', 3 + (party - 1) + Math.floor(this.rng() * 2));
    }
    // Old Scar: heard often, seen twice. The second time is at last light.
    if (!this.scarDusk && this.scarState === 'done' && this.time > 0.56 && this.time < 0.62) {
      const p = players.find((q) => !this.indoors(q));
      if (p) { this.scarDusk = true; this.scarPass(p); }
    }
    // Pectinodon are silent and come to any light, deep into the cave.
    if (!this.pectinodonOut && this.time > 0.68 && this.time < 0.95) {
      const lit = players.find((q) => q.lightOn || q.torch);
      if (lit) { this.pectinodonOut = true; this.spawnPack('pectinodon', 2); }
    }
    if (this.time < 0.5) { this.pectinodonOut = false; this.scarDusk = false; }
    if (this.clock > this.nextAmbient) {
      this.nextAmbient = this.clock + 26 + this.rng() * 50;
      const p = players[0];
      const a = this.rng() * 6.283, r = 60 + this.rng() * 120;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (this.nightness() > 0.5) this.sound(this.rng() < 0.6 ? 'raptor_chirp' : 'twig', x, p.y, z, 0.8);
      else if (this.mission >= 3 && this.rng() < 0.3) this.sound('trex_far', x * 2 - p.x, p.y + 10, z * 2 - p.z, 1);
    }
    void this.nextDirector; void FIRE_FEAR_RADIUS; void setMode;
  }

  // ---- snapshots ------------------------------------------------------------------------------

  snapshotFor(id: number): Snapshot | null {
    const me = this.players.get(id);
    if (!me) return null;
    const players: PlayerSnap[] = [];
    for (const p of this.players.values()) {
      let flags = 0;
      if (p.crouched) flags |= PF_CROUCH; if (p.sprinting) flags |= PF_SPRINT; if (p.lightOn) flags |= PF_LIGHT;
      if (p.downed > 0) flags |= PF_DOWNED; if (p.dead) flags |= PF_DEAD; if (p.working) flags |= PF_WORKING; if (p.torch) flags |= PF_TORCH; if (p.moving) flags |= PF_MOVING;
      players.push({ id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, flags, held: p.held >= 0 && p.inv[p.held] ? ITEM_INDEX.indexOf(p.inv[p.held]!.id) : 255 });
    }
    // People the story puts in the world travel the same way as other players.
    for (const n of this.story.npcs) players.push({ id: n.id, x: n.x, y: n.y, z: n.z, yaw: n.yaw, pitch: 0, flags: n.moving ? PF_MOVING : 0, held: 255 });
    const dinos: DinoSnap[] = [];
    for (const d of this.dinos) {
      if (Math.hypot(d.x - me.x, d.z - me.z) > 300) continue;
      dinos.push({ id: d.id, species: d.speciesIndex, x: d.x, y: d.y, z: d.z, yaw: d.yaw, anim: d.anim, speed: d.speed, flags: d.flags });
    }
    const fires: FireSnap[] = this.fires.map((f) => ({ id: f.id, fuel: f.fuel, lit: f.lit }));
    return {
      tick: this.tick, time: this.time, weather: this.weather, tension: this.tension, players, dinos, fires,
      self: { ack: me.ack, x: me.x, y: me.y, z: me.z, vx: me.vx, vy: me.vy, vz: me.vz, moveScale: this.moveScale(me), stamina: me.stamina, health: me.health, hunger: me.hunger, thirst: me.thirst, heat: me.heat, fear: me.fear, bleeding: me.bleeding, fracture: me.fracture, grounded: me.grounded, downed: me.downed, battery: me.battery, riding: !!me.ride, fever: me.fever, film: this.story.counters.film ?? 0 },
    };
  }
}

export { MISSIONS, PLAYER };
