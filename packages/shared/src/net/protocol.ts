/**
 * Wire protocol. Reliable events are JSON; world state is a compact binary snapshot.
 * Both travel over the same link: a Web Worker port in solo, a WebSocket in co-op.
 */
import type { ItemId } from '../data/items.ts';

export type ClientMsg =
  | { t: 'hello'; name: string; character: number; version: number; save?: SaveData }
  | { t: 'input'; seq: number; buttons: number; yaw: number; pitch: number }
  | { t: 'interact'; node?: number; prop?: string }
  | { t: 'craft'; id: ItemId }
  | { t: 'knap'; hits: number; good: number }
  | { t: 'hold'; slot: number }
  | { t: 'light'; on: boolean }
  | { t: 'place_fire' }
  | { t: 'feed_fire'; fire: number }
  | { t: 'ignite'; fire: number }
  | { t: 'drink' }
  | { t: 'chop' }
  | { t: 'chat'; text: string }
  | { t: 'ping'; kind: 'danger' | 'here' | 'help' | 'hide'; x: number; y: number; z: number }
  | { t: 'sleep'; on: boolean }
  | { t: 'revive'; target: number }
  /** Left click: strike with what is in the hand, take a photo, or record a note. */
  | { t: 'attack' }
  /** Eat, drink or apply what is in this pack slot. */
  | { t: 'use'; slot: number }
  /** Swap two pack slots. */
  | { t: 'move'; from: number; to: number }
  /** Leave a pack slot behind. Story items cannot be dropped. */
  | { t: 'drop'; slot: number }
  /** Press E on a place the story has made interactive. */
  | { t: 'act'; id: string }
  /** Fill the pot at the river. */
  | { t: 'fill' }
  /** The client has finished loading a map. */
  | { t: 'map_ready' };

export interface InvSlot { id: ItemId; n: number; wear?: number }

/** One line of the objective checklist. `at` is where the way-marker points while this step is open. */
export interface StepView { text: string; done: boolean; at?: { x: number; y: number; z: number; label: string }; glint?: string; craft?: ItemId }
/** A place in the world with an E prompt, written by the story. */
export interface SpotView { id: string; x: number; y: number; z: number; label: string; reach: number }
export interface EnvView { star: number; copper: number; aurora: number; ash: number; flood: number; quake: number; storm: number; rift: number; day: number; era: 0 | 1969 }
export interface WidgetView { kind: 'compass' | 'signal' | ''; angle: number; strength: number; text?: string }
export interface NpcView { id: number; character: number; name: string }

/** Everything needed to carry on later. */
export interface SaveData { v: number; map: string; time: number; mission: number; seed: number; taken: string[]; journal: string[]; story: StorySave; maps: Record<string, MapSave>; players: PlayerSave[] }
export interface StorySave { flags: string[]; counters: Record<string, number>; stage: Record<string, number>; open: Record<string, boolean>; sides: string[]; shown: string[]; recordings: number }
export interface MapSave { nodes: number[]; fires: { x: number; y: number; z: number; fuel: number; lit: boolean }[] }
export interface PlayerSave { character: number; x: number; y: number; z: number; yaw: number; health: number; hunger: number; thirst: number; heat: number; bleeding: number; fever: number; battery: number; inv: (InvSlot | null)[] }

export type ServerEvent =
  | { t: 'welcome'; you: number; seed: number; nodes: number[]; time: number; mission: number; map: string; code?: string }
  | { t: 'inventory'; slots: (InvSlot | null)[]; held: number }
  | { t: 'mission'; index: number; note?: string }
  | { t: 'journal'; clue: string; by: number }
  | { t: 'line'; text: string; speaker?: number }
  | { t: 'node_gone'; id: number }
  | { t: 'node_back'; id: number }
  | { t: 'sound'; id: string; x: number; y: number; z: number; volume?: number; species?: number }
  | { t: 'noise'; x: number; y: number; z: number; range: number; by: number }
  | { t: 'work'; seconds: number; label: string }
  | { t: 'work_done' }
  | { t: 'death'; player: number; killer: string; seed: number; x: number; y: number; z: number; cause: string }
  | { t: 'respawn'; player: number }
  | { t: 'fire'; id: number; x: number; y: number; z: number; lit: boolean }
  | { t: 'chat'; from: string; text: string }
  | { t: 'ping'; kind: string; x: number; y: number; z: number; from: number }
  | { t: 'roster'; players: { id: number; name: string; character: number }[] }
  | { t: 'prop_gone'; id: string }
  | { t: 'prop_show'; id: string }
  | { t: 'objective'; steps: StepView[]; how: string; title?: string }
  | { t: 'spots'; list: SpotView[] }
  | { t: 'structure'; id: string; stage: number; open?: boolean }
  | { t: 'env'; env: EnvView }
  | { t: 'widget'; widget: WidgetView }
  | { t: 'npcs'; list: NpcView[] }
  | { t: 'map'; id: string; x: number; y: number; z: number; yaw: number }
  | { t: 'save'; data: SaveData }
  | { t: 'side'; id: string }
  | { t: 'ending'; id: string }
  | { t: 'hit'; x: number; y: number; z: number; killed: boolean }
  | { t: 'state'; map: string; props: string[]; shown: string[]; journal: string[]; sides: string[]; structures: Record<string, number>; open: Record<string, boolean>; fires: { id: number; x: number; y: number; z: number; lit: boolean }[] };

export const PROTOCOL_VERSION = 3;

export interface PlayerSnap {
  id: number; x: number; y: number; z: number; yaw: number; pitch: number;
  flags: number; // PF_*
  held: number; // item enum index
}
export const PF_CROUCH = 1, PF_SPRINT = 2, PF_LIGHT = 4, PF_DOWNED = 8, PF_DEAD = 16, PF_WORKING = 32, PF_TORCH = 64, PF_MOVING = 128;

export interface DinoSnap { id: number; species: number; x: number; y: number; z: number; yaw: number; anim: number; speed: number; flags: number }
export interface FireSnap { id: number; fuel: number; lit: boolean }
export interface SelfSnap { ack: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; moveScale: number; stamina: number; health: number; hunger: number; thirst: number; heat: number; fear: number; bleeding: number; fracture: number; grounded: boolean; downed: number; battery: number; riding: boolean; fever: number; film: number }
export interface Snapshot { tick: number; time: number; weather: number; tension: number; self: SelfSnap; players: PlayerSnap[]; dinos: DinoSnap[]; fires: FireSnap[] }

const POS = 32; // 1/32 m
const ANG = 65536 / (Math.PI * 2);

export function encodeSnapshot(s: Snapshot): ArrayBuffer {
  const size = 4 + 4 + 1 + 1 + 54 + 1 + s.players.length * 16 + 1 + s.dinos.length * 15 + 1 + s.fires.length * 3;
  const buf = new ArrayBuffer(size);
  const d = new DataView(buf);
  let o = 0;
  d.setUint32(o, s.tick, true); o += 4;
  d.setFloat32(o, s.time, true); o += 4;
  d.setUint8(o++, Math.round(s.weather * 255));
  d.setUint8(o++, Math.round(s.tension * 255));
  const me = s.self;
  d.setUint32(o, me.ack, true); o += 4;
  d.setFloat32(o, me.x, true); o += 4; d.setFloat32(o, me.y, true); o += 4; d.setFloat32(o, me.z, true); o += 4; d.setFloat32(o, me.vy, true); o += 4;
  d.setFloat32(o, me.stamina, true); o += 4;
  for (const v of [me.health, me.hunger, me.thirst, me.heat, me.fear, me.bleeding, me.fracture, me.fever]) { d.setUint8(o++, Math.max(0, Math.min(255, Math.round(v * 2.55)))); }
  d.setUint8(o++, (me.grounded ? 1 : 0) | (me.riding ? 2 : 0));
  d.setUint8(o++, me.film);
  d.setFloat32(o, me.downed, true); o += 4;
  d.setFloat32(o, me.battery, true); o += 4;
  d.setFloat32(o, me.vx, true); o += 4; d.setFloat32(o, me.vz, true); o += 4;
  d.setFloat32(o, me.moveScale, true); o += 4;
  d.setUint8(o++, s.players.length);
  for (const p of s.players) {
    d.setUint8(o++, p.id);
    d.setInt16(o, Math.round(p.x * POS), true); o += 2; d.setInt16(o, Math.round(p.y * POS), true); o += 2; d.setInt16(o, Math.round(p.z * POS), true); o += 2;
    d.setUint16(o, (((p.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * ANG, true); o += 2;
    d.setInt16(o, Math.round(p.pitch * 16384), true); o += 2;
    d.setUint8(o++, p.flags); d.setUint8(o++, p.held);
    o += 2; // reserved
  }
  d.setUint8(o++, s.dinos.length);
  for (const n of s.dinos) {
    d.setUint16(o, n.id, true); o += 2;
    d.setUint8(o++, n.species);
    d.setInt16(o, Math.round(n.x * POS), true); o += 2; d.setInt16(o, Math.round(n.y * POS), true); o += 2; d.setInt16(o, Math.round(n.z * POS), true); o += 2;
    d.setUint16(o, (((n.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * ANG, true); o += 2;
    d.setUint8(o++, n.anim); d.setUint8(o++, Math.min(255, Math.round(n.speed * 16))); d.setUint8(o++, n.flags);
  }
  d.setUint8(o++, s.fires.length);
  for (const f of s.fires) { d.setUint8(o++, f.id); d.setUint8(o++, Math.round(f.fuel * 255)); d.setUint8(o++, f.lit ? 1 : 0); }
  return buf.slice(0, o);
}

export function decodeSnapshot(buf: ArrayBuffer): Snapshot {
  const d = new DataView(buf);
  let o = 0;
  const tick = d.getUint32(o, true); o += 4;
  const time = d.getFloat32(o, true); o += 4;
  const weather = d.getUint8(o++) / 255, tension = d.getUint8(o++) / 255;
  const ack = d.getUint32(o, true); o += 4;
  const x = d.getFloat32(o, true); o += 4, 0; const y = d.getFloat32(o, true); o += 4; const z = d.getFloat32(o, true); o += 4; const vy = d.getFloat32(o, true); o += 4;
  const stamina = d.getFloat32(o, true); o += 4;
  const v = () => d.getUint8(o++) / 2.55;
  const health = v(), hunger = v(), thirst = v(), heat = v(), fear = v(), bleeding = v(), fracture = v(), fever = v();
  const bits = d.getUint8(o++), grounded = (bits & 1) !== 0, riding = (bits & 2) !== 0;
  const film = d.getUint8(o++);
  const downed = d.getFloat32(o, true); o += 4;
  const battery = d.getFloat32(o, true); o += 4;
  const vx2 = d.getFloat32(o, true); o += 4; const vz2 = d.getFloat32(o, true); o += 4;
  const moveScale = d.getFloat32(o, true); o += 4;
  const players: PlayerSnap[] = [];
  for (let n = d.getUint8(o++); n > 0; n--) {
    const id = d.getUint8(o++);
    const px = d.getInt16(o, true) / POS; o += 2; const py = d.getInt16(o, true) / POS; o += 2; const pz = d.getInt16(o, true) / POS; o += 2;
    const yaw = d.getUint16(o, true) / ANG; o += 2;
    const pitch = d.getInt16(o, true) / 16384; o += 2;
    const flags = d.getUint8(o++), held = d.getUint8(o++);
    o += 2;
    players.push({ id, x: px, y: py, z: pz, yaw, pitch, flags, held });
  }
  const dinos: DinoSnap[] = [];
  for (let n = d.getUint8(o++); n > 0; n--) {
    const id = d.getUint16(o, true); o += 2;
    const species = d.getUint8(o++);
    const px = d.getInt16(o, true) / POS; o += 2; const py = d.getInt16(o, true) / POS; o += 2; const pz = d.getInt16(o, true) / POS; o += 2;
    const yaw = d.getUint16(o, true) / ANG; o += 2;
    const anim = d.getUint8(o++), speed = d.getUint8(o++) / 16, flags = d.getUint8(o++);
    dinos.push({ id, species, x: px, y: py, z: pz, yaw, anim, speed, flags });
  }
  const fires: FireSnap[] = [];
  for (let n = d.getUint8(o++); n > 0; n--) { const id = d.getUint8(o++), fuel = d.getUint8(o++) / 255, lit = d.getUint8(o++) === 1; fires.push({ id, fuel, lit }); }
  return { tick, time, weather, tension, self: { ack, x, y, z, vx: vx2, vy, vz: vz2, moveScale, stamina, health, hunger, thirst, heat, fear, bleeding, fracture, grounded, downed, battery, riding, fever, film }, players, dinos, fires };
}
