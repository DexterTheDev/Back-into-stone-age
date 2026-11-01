/** The running game: owns every system and the frame loop. Vue never touches this per frame. */
import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  HALF_WORLD, INPUT_DT, ObstacleGrid, PF_DOWNED, PF_LIGHT, PF_TORCH, PHYS_RES, PROPS, WORLD_SIZE, phaseName, ITEMS,
  type ClientMsg, type SaveData, type ServerEvent, type Snapshot, type ItemId,
} from '@dino/shared';
import { Btn, CollisionWorld, PLAYER, type MoveState } from '@dino/shared/sim/movement.ts';
import { fetchGz, loadGLB } from './assets.ts';
import { GameAudio } from './audio/Audio.ts';
import { Input } from './Input.ts';
import { SocketLink, WorkerLink, type Link } from './net/Link.ts';
import { Cave } from './render/Cave.ts';
import { Creatures } from './render/Creatures.ts';
import { Fires } from './render/Fires.ts';
import { Flora } from './render/Flora.ts';
import { buildHeld } from './render/Held.ts';
import { Arms, People, type Person } from './render/People.ts';
import { Decals } from './render/Decals.ts';
import type { GuideHost } from './Guide.ts';
import { Glints } from './render/Glints.ts';
import { Guide } from './Guide.ts';
import { Props } from './render/Props.ts';
import { Structures } from './render/Structures.ts';
import { Atmosphere } from './render/Atmosphere.ts';
import { Sky, phaseAt } from './render/Sky.ts';
import { Stage, type Preset } from './render/Stage.ts';
import { Terrain } from './render/Terrain.ts';
import { Water } from './render/Water.ts';
import { WorldData } from './world.ts';
import type { useGame } from '../stores/game.ts';

export interface StartOptions { mode: 'solo' | 'host' | 'join'; code?: string; server?: string; name: string; character: number; preset: Preset; forceWebGL?: boolean; gore: boolean; photosensitive: boolean; muted?: boolean; tips: boolean; save?: SaveData }

type Store = ReturnType<typeof useGame>;
type TargetKind = 'node' | 'prop' | 'fire' | 'revive' | 'drink' | 'fill' | 'chop' | 'layfire' | 'spot';

interface InputRecord { seq: number; buttons: number; yaw: number }

export class Game {
  stage: Stage;
  world = new WorldData();
  terrain!: Terrain; sky = new Sky(); cave!: Cave; flora!: Flora; water!: Water; fires = new Fires(); creatures = new Creatures(); props!: Props; structures!: Structures; atmosphere = new Atmosphere();
  audio: GameAudio;
  input: Input;
  link!: Link;
  collision!: CollisionWorld;
  capsule!: ReturnType<CollisionWorld['capsule']>;
  me: MoveState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, grounded: false, crouched: false, stamina: 100 };
  private prev = { x: 0, y: 0, z: 0 };
  private history: InputRecord[] = [];
  private seq = 1;
  private accum = 0;
  private last = performance.now();
  private snap: Snapshot | null = null;
  private snapTime = 0;
  private dayT = 0.22;
  private skyT = 0.22;
  private flash = new THREE.SpotLight(0xffe6c0, 0, 75, 0.5, 0.62, 1.5);
  private fireFuel = new Map<number, number>();
  private fireSpots = new Map<number, { id: number; x: number; y: number; z: number; lit: boolean }>();
  private myId = 0;
  private dead = false;
  private deathT = 0;
  private deathKiller = '';
  private slowMo = 1;
  private shake = 0;
  private bob = 0;
  private caveF = 0;
  private hudT = 0;
  private lightOn = false;
  private viewItem: THREE.Object3D | null = null;
  private viewModels = new Map<string, THREE.Object3D>();
  private frame = 0;
  private frameStart = performance.now();
  private fpsT = 0; private fpsN = 0;
  private running = true;
  private target: { kind: TargetKind; id: number | string; label: string } | null = null;
  private grid!: ObstacleGrid;
  private glints = new Glints();
  private guide!: Guide;
  private pausedAt = 0;
  private others = new Map<number, { person: Person; x: number; y: number; z: number; yaw: number; flags: number; light?: THREE.SpotLight }>();
  private people = new People();
  private arms: Arms | null = null;
  private characters = new Map<number, number>();
  private worldPings: { x: number; y: number; z: number; kind: string; until: number; id: number }[] = [];
  private pingId = 1;
  private fakeT = 30;
  private beam = 1;

  constructor(private canvas: HTMLCanvasElement, private store: Store, private opts: StartOptions) {
    this.stage = new Stage(canvas, opts.preset, opts.forceWebGL);
    this.audio = new GameAudio();
    if (opts.muted) this.audio.master.gain.value = 0;
    this.input = new Input(canvas);
    this.input.sensitivity = () => store.sens / 100;
    this.input.onKey = (c) => this.key(c);
    this.input.onClick = () => this.strike();
    // Esc hands the mouse back to the browser without a key event, so pause on losing the lock.
    this.input.onLockLost = () => {
      const s = this.store;
      if (s.screen === 'play' && !s.panel && !s.knapping && !s.chatting && !s.dying) { s.panel = 'pause'; this.pausedAt = performance.now(); this.input.enabled = false; }
    };
  }

  private async progress<T>(pct: number, label: string, p: Promise<T>) {
    this.store.loadPct = pct; this.store.loadLabel = label;
    return p;
  }

  async start() {
    await this.progress(4, 'Starting renderer', this.stage.init());
    const stage = this.stage;
    await this.progress(8, 'Hanging the sky', this.sky.init(stage.scene));
    await this.progress(12, 'Waking the animals', this.creatures.init());
    stage.scene.add(this.creatures.group);
    await this.progress(16, 'The expedition', this.people.init());
    await this.progress(18, 'Fire and stone', this.fires.init());
    stage.scene.add(this.fires.group);
    await this.progress(20, 'Sound', this.audio.load());
    await RAPIER.init();
    this.audio.occlusion = (x, y, z) => !this.collision?.clearLine(this.me.x, this.me.y + 1.6, this.me.z, x, y, z);

    // Flashlight.
    this.flash.castShadow = true;
    this.flash.shadow.mapSize.setScalar(1024);
    this.flash.shadow.camera.near = 0.3;
    this.flash.shadow.camera.far = 75;
    this.flash.shadow.bias = -0.0006;
    this.flash.map = this.beamCookie();
    stage.scene.add(this.flash, this.flash.target);
    stage.scene.add(stage.camera);
    await this.loadViewModels();
    this.atmosphere.init(stage.scene, this.sky);

    // The simulation goes first: it says which map we are on.
    this.switching = true;
    const { mode, name, character } = this.opts;
    let link: WorkerLink | SocketLink;
    if (mode === 'solo') link = new WorkerLink(name, character, this.opts.save);
    else link = new SocketLink(this.opts.server ?? (location.hostname.endsWith('perspectivepharos.online') ? 'wss://server.perspectivepharos.online' : `ws://${location.hostname}:8787`), mode === 'join' ? (this.opts.code ?? '') : null, name, character, this.opts.save);
    this.link = link;
    link.onEvent = (e) => this.onEvent(e);
    link.onSnapshot = (s) => this.onSnapshot(s);
    link.onClose = (r) => { if (this.running) this.store.error = r; };
    const map = new Promise<string>((res) => { this.onWelcome = res; });
    await link.ready;
    if (link instanceof SocketLink) this.store.partyCode = link.code;
    await this.buildWorld(await map);

    this.guide = new Guide(this.guideHost());
    this.store.tipsOn = this.opts.tips;
    this.guide.announce(this.startMission, 1800);
    this.drainBacklog();

    // Compile every material up front, so the first time a thing appears there is no hitch.
    this.terrain.update(stage.camera);
    this.store.loadPct = 100;
    this.store.screen = 'play';
    this.input.enabled = true;
    this.input.lock();
    void this.audio.ctx.resume();
    // Browsers may hold audio until a gesture lands inside the game itself.
    addEventListener('pointerdown', () => void this.audio.ctx.resume(), { once: true });
    addEventListener('keydown', () => void this.audio.ctx.resume(), { once: true });
    this.loop();
  }

  /** Everything that belongs to one map. Sky, animals, sound and people carry over. */
  private async buildWorld(id: string) {
    const stage = this.stage;
    const world = new WorldData(id);
    this.world = world;
    await this.progress(22, 'Reading the land', world.load((p, l) => { this.store.loadPct = 22 + p * 22; this.store.loadLabel = `Loading ${l}`; }));
    this.terrain = new Terrain(world);
    await this.progress(46, 'Laying the ground', this.terrain.init(8));
    stage.scene.add(this.terrain.group);
    this.cave = new Cave(world);
    await this.progress(54, 'Hollowing the rock', this.cave.init(8));
    stage.scene.add(this.cave.group);
    this.flora = new Flora(world, stage.settings.floraR, stage.settings.treeR);
    await this.progress(62, 'Growing the forest', this.flora.init());
    stage.scene.add(this.flora.group);
    this.water = new Water(world);
    this.water.init();
    stage.scene.add(this.water.group);

    // Prediction world, identical to the one the simulation runs.
    const [ph, cp, ci, ob] = await this.progress(76, 'Solid ground', Promise.all(world.collisionFiles().map((f) => fetchGz(f))));
    this.grid = new ObstacleGrid(new Float32Array(ob));
    this.collision = new CollisionWorld(RAPIER, new Float32Array(ph), PHYS_RES, WORLD_SIZE, new Float32Array(cp), new Uint32Array(ci), this.grid);
    this.capsule = this.collision.capsule();
    (world.meta.platforms ?? []).forEach((p, i) => this.collision.setBlock(`platform${i}`, true, p.x, p.y, p.z, p.hx, p.hy, p.hz, p.yaw ?? 0));

    this.store.loadPct = 88; this.store.loadLabel = 'Joining';
    this.props = new Props(world);
    await this.progress(92, 'Placing what was left behind', this.props.init());
    this.props.setLive(this.pendingNodes);
    stage.scene.add(this.props.group);
    this.structures = new Structures(world);
    await this.progress(95, 'What the others built', this.structures.init());
    stage.scene.add(this.structures.group);
    // The dropped flashlight flickers on a loose contact: the first thing you ever see.
    const fp = world.meta.props.find((q) => q.id === 'flashlight');
    this.flicker.intensity = 0;
    stage.scene.remove(this.flicker);
    if (fp) { this.flicker.position.set(fp.x, fp.y + 0.5, fp.z); stage.scene.add(this.flicker); }
    this.applyPending();
    this.decals = new Decals(world, stage.scene);
    await this.decals.init();
    this.glints.init();
    stage.scene.add(this.glints.group);
    this.sky.setLook(world.meta.look);
  }

  private disposeWorld() {
    const stage = this.stage;
    for (const g of [this.terrain.group, this.cave.group, this.flora.group, this.water.group, this.props.group, this.structures.group]) {
      stage.scene.remove(g);
      g.traverse((o) => { (o as THREE.Mesh).geometry?.dispose(); });
    }
    this.decals?.dispose();
    this.fires.clear();
    this.fireSpots.clear();
    for (const [id, o] of this.others) { stage.scene.remove(o.person.root); if (o.light) stage.scene.remove(o.light, o.light.target); this.others.delete(id); }
    this.creatures.clear();
  }

  /** Everyone crosses together: the map swaps behind a loading screen while the world waits. */
  private async enterMap(e: Extract<ServerEvent, { t: 'map' }>) {
    if (this.switching) { this.me.x = e.x; this.me.y = e.y; this.me.z = e.z; return; }
    this.switching = true;
    const st = this.store;
    st.screen = 'loading'; st.loadPct = 20; st.loadLabel = 'The land changes';
    this.input.enabled = false;
    this.input.unlock();
    this.disposeWorld();
    await this.buildWorld(e.id);
    Object.assign(this.me, { x: e.x, y: e.y, z: e.z, vx: 0, vy: 0, vz: 0, grounded: false });
    this.prev = { x: e.x, y: e.y, z: e.z };
    this.footY = e.y;
    this.history = [];
    this.correction.set(0, 0, 0);
    this.input.yaw = e.yaw;
    this.pendingNodes = [];
    this.drainBacklog();
    this.frame = 0;
    st.loadPct = 100;
    st.screen = 'play';
    this.input.enabled = true;
    this.input.lock();
    this.send({ t: 'map_ready' });
  }

  private switching = false;
  private backlog: ServerEvent[] = [];
  private onWelcome: ((map: string) => void) | null = null;
  private decals: Decals | null = null;

  private drainBacklog() {
    this.switching = false;
    for (const e of this.backlog.splice(0)) this.onEvent(e);
  }

  private startMission = 0;
  private pointerEverLocked = false;
  private guideHost(): GuideHost {
    const game = this;
    return {
      store: this.store, world: this.world, camera: this.stage.camera, me: this.me,
      nodes: () => this.props.nodes.values(),
      hasProp: (id) => this.props.props.has(id),
      firePlaced: () => { for (const f of this.fireSpots.values()) return f; return null; },
      fireLit: () => { for (const f of this.fireSpots.values()) if (f.lit) return { ...f, fuel: this.fireFuel.get(f.id) ?? 1 }; return null; },
      nearestOther: () => { let b: { x: number; y: number; z: number } | null = null, d = 1e9; for (const o of this.others.values()) { const q = Math.hypot(o.x - this.me.x, o.z - this.me.z); if (q < d) { d = q; b = o; } } return b; },
      nearestDino: () => { let d = 1e9; for (const a of this.creatures.actors.values()) d = Math.min(d, a.pos.distanceTo(this.stage.camera.position)); return d; },
      underRock: () => this.caveF > 0.5,
      dayT: () => game.dayT,
      stat: () => ({ thirst: this.snap?.self.thirst ?? 100, heat: this.snap?.self.heat ?? 100, battery: this.snap?.self.battery ?? 100 }),
      world2: () => this.world,
    };
  }

  private pendingNodes: number[] = [];
  private pendingProps: string[] = [];
  private applyPending() { for (const p of this.pendingProps) this.props.removeProp(p); this.pendingProps = []; }

  private flicker = new THREE.PointLight(0xffd9a0, 0, 16, 1.7);
  private flickerT = 0;

  private beamCookie() {
    const S = 256, c = new OffscreenCanvas(S, S), g = c.getContext('2d')!;
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    r.addColorStop(0, '#fff7e8'); r.addColorStop(0.22, '#ffe9c8'); r.addColorStop(0.3, '#b89d7c'); r.addColorStop(0.42, '#d4b890'); r.addColorStop(0.72, '#5a4a38'); r.addColorStop(1, '#000');
    g.fillStyle = r; g.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private async loadViewModels() {
    this.arms = new Arms(this.people.create(this.opts.character), this.stage.camera);
    await buildHeld(this.arms);
    this.torchLight = new THREE.PointLight(0xff8a3c, 0, 22, 1.5);
    this.stage.scene.add(this.torchLight);
  }

  send(m: ClientMsg) { this.link.send(m); }

  // ---- events ------------------------------------------------------------------------------

  private onEvent(e: ServerEvent) {
    const s = this.store;
    if (e.t === 'map') { void this.enterMap(e); return; }
    if (e.t === 'welcome') {
      if (e.you) this.myId = e.you;
      this.pendingNodes = e.nodes; this.dayT = this.skyT = e.time; this.startMission = e.mission;
      this.onWelcome?.(e.map); this.onWelcome = null;
      if (!this.switching) this.props?.setLive(e.nodes);
      return;
    }
    // Nothing about a map can land until that map exists.
    if (this.switching && e.t !== 'inventory' && e.t !== 'save' && e.t !== 'roster') { this.backlog.push(e); return; }
    switch (e.t) {
      case 'state':
        this.pendingProps.push(...e.props); s.journal = e.journal; s.sides = e.sides;
        this.applyPending();
        for (const f of e.fires) this.fireEvent(f);
        for (const id of e.shown) this.props?.show(id);
        for (const [id, stage] of Object.entries(e.structures)) this.structureEvent(id, stage, e.open[id]);
        break;
      case 'inventory': s.slots = e.slots; s.held = e.held; s.syncBelt(); this.refreshHeld(); break;
      case 'mission': this.guide?.announce(e.index); s.serverSteps = []; break;
      case 'objective': s.serverSteps = e.steps; s.how = e.how; if (e.title) s.objective = e.title; break;
      case 'spots': s.spots = e.list; break;
      case 'structure': this.structureEvent(e.id, e.stage, e.open); break;
      case 'prop_show': this.props?.show(e.id); break;
      case 'env': s.env = e.env; this.structures?.setEra(e.env.era !== 0); break;
      case 'widget': s.widget = e.widget; break;
      case 'npcs': for (const q of e.list) this.characters.set(q.id, q.character); break;
      case 'side': if (!s.sides.includes(e.id)) s.sides = [...s.sides, e.id]; break;
      case 'save': try { localStorage.setItem('dh.save', JSON.stringify(e.data)); } catch { /* private mode */ } break;
      case 'hit': s.hitAt = performance.now(); break;
      case 'ending':
        s.ending = e.id; s.screen = 'end'; this.input.enabled = false; this.input.unlock();
        // Too late can be retried from the last save. Every other ending is the end.
        if (e.id !== 'too_late') try { localStorage.removeItem('dh.save'); } catch { /* private mode */ }
        break;
      case 'journal': if (!s.journal.includes(e.clue)) s.journal = [...s.journal, e.clue]; break;
      case 'line': s.line = e.text; s.lineUntil = performance.now() + 4500; break;
      case 'node_gone': this.props?.removeNode(e.id); break;
      case 'prop_gone': if (this.props) this.props.removeProp(e.id); else this.pendingProps.push(e.id); break;
      case 'sound': this.audio.play(e.id, e.x, e.y, e.z, e.volume ?? 1); if (e.id === 'trex_roar' || e.id === 'quake') this.shake = 1; break;
      case 'noise': s.noiseRing = e.range; s.noiseAt = performance.now(); break;
      case 'ping': this.worldPings.push({ ...e, until: performance.now() + 5000, id: this.pingId++ }); this.audio.play('click', e.x, e.y, e.z, 1); break;
      case 'work': s.workLabel = e.label; s.workSeconds = e.seconds; s.workStarted = performance.now(); break;
      case 'work_done': s.workLabel = ''; break;
      case 'fire': this.fireEvent(e); break;
      case 'death': if (e.player === this.myId) this.startDeath(e.killer, e.cause); break;
      case 'respawn': if (e.player === this.myId) this.endDeath(); break;
      case 'roster': s.roster = e.players; for (const q of e.players) this.characters.set(q.id, q.character); break;
      case 'chat': s.chat = [...s.chat.slice(-5), { from: e.from, text: e.text }]; break;
      default: break;
    }
  }

  private structureEvent(id: string, stage: number, open?: boolean) {
    this.structures?.set(id, stage, open);
    if (!this.collision) return;
    const f = this.world.meta.features;
    const solid = id === 'door' ? stage >= 4 && !open : id === 'seal' ? stage >= 1 : false;
    if (id === 'door' && f.door) { if (solid) this.collision.setBlock(id, true, f.door.x, f.door.y + 4, f.door.z, 0.5, 5, 7.5, 0); else this.collision.setBlock(id, false); }
    if (id === 'seal' && f.seal) { if (solid) this.collision.setBlock(id, true, f.seal.x, f.seal.y + 2, f.seal.z, 0.5, 3, 6, f.seal.yaw ?? 0); else this.collision.setBlock(id, false); }
  }

  private fireEvent(f: { id: number; x: number; y: number; z: number; lit: boolean }) {
    this.fires.setFire(f.id, f.x, f.y, f.z, f.lit);
    this.fireSpots.set(f.id, f);
    this.audio.fireLoop(f.x, f.y + 0.5, f.z, f.lit);
  }


  private refreshHeld() {
    const s = this.store;
    const id = s.held >= 0 ? s.slots[s.held]?.id ?? '' : '';
    this.arms?.hold(id || (this.lightOn ? 'flashlight' : ''));
  }

  private onSnapshot(s: Snapshot) {
    if (this.switching) return;
    const now = performance.now();
    this.snap = s; this.snapTime = now;
    this.dayT = s.time;
    this.creatures.ingest(s.dinos, now);
    this.fireFuel.clear();
    for (const f of s.fires) this.fireFuel.set(f.id, f.lit ? f.fuel : 0);
    // Reconcile: take the server's answer, replay anything it has not seen yet.
    const me = s.self;
    const start = this.frame === 0;
    const m = this.me;
    const ex = Math.hypot(me.x - m.x, me.y - m.y, me.z - m.z);
    this.history = this.history.filter((h) => h.seq > me.ack);
    this.moveScale = me.moveScale;
    const copy: MoveState = { x: me.x, y: me.y, z: me.z, vx: me.vx, vy: me.vy, vz: me.vz, yaw: m.yaw, grounded: me.grounded, crouched: m.crouched, stamina: me.stamina };
    this.riding = me.riding;
    // On a raft or a rope the server has the player: there is nothing to predict.
    if (!me.riding) for (const h of this.history) this.collision.step(this.capsule, copy, h.buttons, h.yaw, INPUT_DT, this.moveScale);
    const ox = m.x - copy.x, oy = m.y - copy.y, oz = m.z - copy.z;
    if (start || ex > 3) this.correction.set(0, 0, 0);
    else this.correction.add(new THREE.Vector3(ox, oy, oz));
    // Physics takes the corrected state at once. The eye eases over, so a correction is never seen as a jump.
    Object.assign(m, copy);
    this.prev = start || ex > 3 ? { x: m.x, y: m.y, z: m.z } : { x: this.prev.x - ox, y: this.prev.y - oy, z: this.prev.z - oz };
    const st = this.store;
    st.downed = me.downed;
    const others = new Set<number>();
    for (const p of s.players) {
      if (p.id === this.myId) { const on = (p.flags & PF_LIGHT) !== 0; if (on !== this.lightOn) { this.lightOn = on; this.refreshHeld(); } continue; }
      others.add(p.id);
      this.updateOther(p);
    }
    for (const [id, o] of this.others) if (!others.has(id)) { this.stage.scene.remove(o.person.root); if (o.light) this.stage.scene.remove(o.light, o.light.target); this.others.delete(id); }
  }

  private updateOther(p: Snapshot['players'][number]) {
    let o = this.others.get(p.id);
    if (!o) {
      const person = this.people.create(this.characters.get(p.id) ?? p.id);
      // In 1969 the old man wears a suit and his men wear uniforms.
      if (p.id >= 202) this.people.dress(person, p.id === 202 ? 0x4a4c52 : 0x363c2c);
      this.stage.scene.add(person.root);
      o = { person, x: p.x, y: p.y, z: p.z, yaw: p.yaw, flags: p.flags };
      this.others.set(p.id, o);
    }
    o.x = p.x; o.y = p.y; o.z = p.z; o.yaw = p.yaw; o.flags = p.flags;
    this.people.animate(o.person, p.flags);
    if ((p.flags & (PF_LIGHT | PF_TORCH)) && !o.light) {
      o.light = new THREE.SpotLight(0xffe6c0, 300, 50, 0.45, 0.6, 1.6);
      this.stage.scene.add(o.light, o.light.target);
    }
    if (o.light) o.light.intensity = p.flags & (PF_LIGHT | PF_TORCH) ? 300 : 0;
  }

  // ---- input ------------------------------------------------------------------------------

  private key(code: string) {
    const s = this.store;
    if (s.screen !== 'play') return;
    if (code === 'Escape') {
      if (performance.now() - this.pausedAt < 300) return; // the same press that released the mouse
      s.panel = s.panel ? '' : 'pause'; this.syncPointer(); return;
    }
    if (code === 'KeyM') { return; }
    if (code === 'Tab' || code === 'KeyI') { s.panel = s.panel === 'pack' ? '' : 'pack'; this.guide.did.pack = true; this.syncPointer(); return; }
    if (code === 'KeyJ') { s.panel = s.panel === 'journal' ? '' : 'journal'; this.guide.did.journal = true; this.syncPointer(); return; }
    if (code === 'F3') { s.showStats = !s.showStats; return; }
    if (s.panel || s.knapping || s.chatting) return;
    if (code === 'KeyF') { this.send({ t: 'light', on: !this.lightOn }); this.guide.did.light = true; }
    if (code === 'KeyE') this.interact();
    if (code === 'KeyH') this.guide.reveal();
    if (code === 'KeyG') { this.send({ t: 'chop' }); this.arms?.swing(); this.guide.did.chop = true; }
    if (code === 'KeyR') this.send({ t: 'drink' });
    if (code.startsWith('Digit')) {
      // The bar holds kinds of item, in the player's order, wherever they sit in the pack.
      const id = s.belt[Number(code.slice(5)) - 1];
      if (id) { const slot = s.packSlot(id); if (slot >= 0) this.send({ t: 'hold', slot: s.held === slot ? -1 : slot }); }
    }
    const ping = ({ KeyQ: 'here', KeyZ: 'danger', KeyX: 'help', KeyV: 'hide' } as Record<string, 'here' | 'danger' | 'help' | 'hide'>)[code];
    if (ping) { const d = new THREE.Vector3(); this.stage.camera.getWorldDirection(d); this.send({ t: 'ping', kind: ping, x: this.me.x + d.x * 7, y: this.me.y + 1.2 + d.y * 7, z: this.me.z + d.z * 7 }); }
    if (code === 'KeyT') { s.chatting = true; this.input.enabled = false; this.input.unlock(); }
  }

  /** Left click. The server decides what it meant. */
  private strike() {
    const s = this.store;
    if (s.screen !== 'play' || s.panel || s.knapping || s.chatting) return;
    const held = s.held >= 0 ? s.slots[s.held]?.id : undefined;
    const armed = held ? !!ITEMS[held].weapon : s.slots.some((q) => q && ITEMS[q.id].weapon && !ITEMS[q.id].weapon!.ammo);
    if (armed) this.arms?.swing();
    this.send({ t: 'attack' });
    this.guide.did.strike = true;
  }

  useSlot(slot: number) { this.send({ t: 'use', slot }); this.store.panel = ''; this.syncPointer(); }
  moveSlot(from: number, to: number) { this.send({ t: 'move', from, to }); }
  dropSlot(slot: number) { this.send({ t: 'drop', slot }); }

  finishChat(text: string) {
    this.store.chatting = false;
    if (text.trim()) this.send({ t: 'chat', text: text.trim() });
    this.syncPointer();
  }

  syncPointer() {
    const open = !!this.store.panel || this.store.knapping;
    this.input.enabled = !open;
    if (open) this.input.unlock(); else this.input.lock();
  }

  /** Clicking the game after the mouse was released. */
  regrab() {
    const s = this.store;
    if (s.panel || s.knapping || s.chatting) return;
    this.input.enabled = true;
    this.input.lock();
  }

  private interact() {
    const t = this.target;
    if (!t) return;
    if (t.kind === 'node') this.send({ t: 'interact', node: t.id as number });
    else if (t.kind === 'prop') this.send({ t: 'interact', prop: t.id as string });
    else if (t.kind === 'revive') this.send({ t: 'revive', target: t.id as number });
    else if (t.kind === 'drink') this.send({ t: 'drink' });
    else if (t.kind === 'fill') this.send({ t: 'fill' });
    else if (t.kind === 'spot') this.send({ t: 'act', id: t.id as string });
    else if (t.kind === 'chop') { this.send({ t: 'chop' }); this.arms?.swing(); this.guide.did.chop = true; }
    else if (t.kind === 'layfire') this.send({ t: 'place_fire' });
    else {
      const f = this.fireSpots.get(t.id as number);
      if (f) this.send(f.lit ? { t: 'feed_fire', fire: f.id } : { t: 'ignite', fire: f.id });
    }
  }

  craft(id: ItemId) {
    if (id === 'blade') { this.store.panel = ''; this.store.knapping = true; this.syncPointer(); return; }
    this.send({ t: 'craft', id });
    this.store.panel = ''; this.syncPointer();
  }
  placeFire() { this.send({ t: 'place_fire' }); this.store.panel = ''; this.syncPointer(); }
  finishKnap(hits: number, good: number) { this.send({ t: 'knap', hits, good }); this.store.knapping = false; this.syncPointer(); }
  knapStrike() { this.audio.play('knap', this.me.x, this.me.y + 1, this.me.z); }

  private findTarget() {
    const cam = this.stage.camera, m = this.me;
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    let best: Game['target'] = null, bestScore = 0;
    const consider = (x: number, y: number, z: number, reach: number, kind: TargetKind, id: number | string, label: string) => {
      const dx = x - cam.position.x, dy = y - cam.position.y, dz = z - cam.position.z, d = Math.hypot(dx, dy, dz);
      if (d > reach) return;
      const facing = (dx * dir.x + dy * dir.y + dz * dir.z) / (d || 1);
      if (facing < 0.72) return;
      const score = facing * 2 - d * 0.1;
      if (score > bestScore) { bestScore = score; best = { kind, id, label }; }
    };
    for (const { node } of this.props.nodes.values()) {
      if (Math.abs(node.x - m.x) > 4 || Math.abs(node.z - m.z) > 4) continue;
      consider(node.x, node.y + 0.1, node.z, 3.2, 'node', node.id, `Take ${ITEMS[(node.kind === 'copper' ? 'copper_ore' : node.kind) as ItemId].name.toLowerCase()}`);
    }
    for (const { prop } of this.props.props.values()) { const d = PROPS[prop.id]; if (d?.label) consider(prop.x, prop.y + 0.3, prop.z, d.reach ?? 4.2, 'prop', prop.id, d.label); }
    for (const q of this.store.spots) consider(q.x, q.y + 0.7, q.z, q.reach + 1.2, 'spot', q.id, q.label);
    const have = (id: ItemId) => this.store.slots.reduce((a, q) => a + (q?.id === id ? q.n : 0), 0);
    const wood = have('branch') + have('wood');
    for (const f of this.fireSpots.values()) {
      const fuel = Math.round((this.fireFuel.get(f.id) ?? 0) * 100);
      const label = f.lit ? (wood ? `Feed the fire · ${fuel}%` : `Fire ${fuel}% · needs wood`) : have('bow_drill') ? 'Light it with the bow drill' : 'Needs a bow drill';
      consider(f.x, f.y + 0.3, f.z, 3.5, 'fire', f.id, label);
    }
    for (const [id, o] of this.others) if (o.flags & PF_DOWNED) consider(o.x, o.y + 0.6, o.z, 3, 'revive', id, 'Get them up');
    // Actions that belong to a place rather than a thing, only offered when nothing else is in sight.
    if (!best) {
      const pit = this.world.meta.features.firePit;
      const canLay = have('tinder') >= 2 && wood >= 3;
      if (canLay && this.fireSpots.size === 0 && Math.hypot(pit.x - m.x, pit.z - m.z) < 7) best = { kind: 'layfire', id: 0, label: 'Lay a fire here' };
    }
    if (!best && this.riverEdge() < 3 && have('pot') > 0) best = { kind: 'fill', id: 0, label: 'Fill the pot' };
    if (!best && this.riverEdge() < 3 && (this.snap?.self.thirst ?? 100) < 96) best = { kind: 'drink', id: 0, label: 'Drink' };
    if (!best && have('hand_axe') > 0) {
      const near: number[] = [];
      const n = this.grid.query(m.x, m.z, 3, near);
      for (let i = 0; i < n; i += 4) if (Math.hypot(m.x - near[i], m.z - near[i + 1]) < near[i + 2] + 1.4 && near[i + 2] < 1.4 && Math.abs(near[i + 3] - m.y) < 6) best = { kind: 'chop', id: 0, label: this.store.missionIndex >= 13 ? 'Fell a pole' : 'Chop for firewood' };
    }
    this.target = best;
  }

  private riverEdge() {
    let d = 1e9;
    for (const p of this.world.meta.river) d = Math.min(d, Math.hypot(this.me.x - p.x, this.me.z - p.z) - p.w);
    return d;
  }

  // ---- death ------------------------------------------------------------------------------

  private startDeath(killer: string, cause: string) {
    this.dead = true; this.deathT = 0; this.deathKiller = killer; this.polaroidTaken = false;
    this.slowMo = 0.3;
    this.store.dying = true;
    this.input.enabled = false;
    this.store.deathCause = cause;
    this.store.respawnAt = performance.now() + 7000;
    const d = new Date(1969, 6, 24);
    this.store.deathDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  private endDeath() {
    this.dead = false; this.slowMo = 1;
    this.store.dying = false;
    this.stage.fx.blackout.value = 0; this.stage.fx.blood.value = 0;
    this.store.screen = 'play';
    this.store.polaroid = '';
    this.input.enabled = true;
    this.input.lock();
    this.frame = 0;
  }

  /** The last Polaroid: must run straight after a render, while the frame is still readable. */
  private takePolaroid() {
    try { this.polaroidShot = this.canvas.toDataURL('image/jpeg', 0.84); } catch { this.polaroidShot = ''; }
    this.polaroidTaken = true;
  }

  // ---- frame ------------------------------------------------------------------------------

  private tickInput() {
    const buttons = this.dead || this.store.panel || this.store.knapping ? 0 : this.input.buttons;
    const yaw = this.input.yaw;
    const seq = this.seq++;
    this.prev = { x: this.me.x, y: this.me.y, z: this.me.z };
    if (this.riding) { this.send({ t: 'input', seq, buttons: 0, yaw, pitch: this.input.pitch }); return; }
    const wasGrounded = this.me.grounded, fall = this.me.vy;
    const r = this.collision.step(this.capsule, this.me, buttons, yaw, INPUT_DT, this.moveScale);
    this.history.push({ seq, buttons, yaw });
    if (this.history.length > 240) this.history.shift();
    if (!wasGrounded && this.me.grounded && fall < -3) {
      this.landDip = Math.min(0.2, -fall * 0.018);
      this.audio.footstep(this.me.x, this.me.y + 1.6, this.me.z, this.surface(), 1);
    }
    this.send({ t: 'input', seq, buttons, yaw, pitch: this.input.pitch });
    // Footsteps from distance actually covered.
    if (r.moving && this.me.grounded) {
      // The bob runs on the stride, so each dip of the view lands with a footfall.
      const step = Math.hypot(this.me.x - this.prev.x, this.me.z - this.prev.z);
      const stride = r.sprinting ? 2.9 : this.me.crouched ? 1.25 : 1.95;
      const before = this.bob;
      this.bob += (step / stride) * Math.PI * 2;
      if (Math.floor(this.bob / (Math.PI * 2)) !== Math.floor(before / (Math.PI * 2))) {
        this.audio.footstep(this.me.x, this.me.y + 1.6, this.me.z, this.surface(), this.me.crouched ? 0.12 : r.sprinting ? 1 : 0.55);
      }
    }
  }

  private surface(): 'leaf' | 'mud' | 'rock' | 'gravel' | 'water' {
    if (this.caveF > 0.5) return 'rock';
    const S = this.world.splat0.width;
    const i = Math.max(0, Math.min(S - 1, Math.floor(((this.me.x + HALF_WORLD) / WORLD_SIZE) * S))), j = Math.max(0, Math.min(S - 1, Math.floor(((this.me.z + HALF_WORLD) / WORLD_SIZE) * S)));
    const o = (j * S + i) * 4, d = this.world.splat0.data, e = this.world.splat1.data;
    const w = [d[o], d[o + 1], d[o + 2], d[o + 3], e[o]];
    const top = w.indexOf(Math.max(...w));
    return (['leaf', 'mud', 'rock', 'gravel', 'mud'] as const)[top];
  }

  private riverNear() {
    let best = 1e9;
    for (let i = 0; i < this.world.meta.river.length; i += 6) { const p = this.world.meta.river[i], d = Math.hypot(this.me.x - p.x, this.me.z - p.z) - p.w; if (d < best) best = d; }
    return Math.max(0, 1 - best / 90);
  }

  private loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.switching) return;
    this.frame++;
    this.fpsT += dt; this.fpsN++;
    this.accum += dt;
    while (this.accum >= INPUT_DT) { this.accum -= INPUT_DT; this.tickInput(); }
    const alpha = this.accum / INPUT_DT;
    dt *= this.slowMo;

    const m = this.me, cam = this.stage.camera, st = this.store;
    this.correction.multiplyScalar(Math.exp(-dt * 14));
    const fix = this.correction;
    const x = this.prev.x + (m.x - this.prev.x) * alpha + fix.x, y = this.prev.y + (m.y - this.prev.y) * alpha + fix.y, z = this.prev.z + (m.z - this.prev.z) * alpha + fix.z;
    const eye = m.crouched ? PLAYER.crouchEye : PLAYER.eye;
    this.eyeH += (eye - this.eyeH) * Math.min(1, dt * 10);
    const speed = Math.hypot(m.vx, m.vz), pace = Math.min(1, speed / PLAYER.sprint);
    const yaw = this.input.yaw, pitch = this.input.pitch;
    // Small rocks and steps lift the capsule in jerks. The eye rides over them.
    if (m.grounded && Math.abs(y - this.footY) < 1) this.footY += (y - this.footY) * (1 - Math.exp(-dt * 26));
    else this.footY = y;
    this.landDip *= Math.exp(-dt * 8);
    const bobY = -Math.cos(this.bob) * (0.006 + 0.012 * pace), bobX = Math.sin(this.bob * 0.5) * (0.004 + 0.007 * pace);
    cam.position.set(x, this.footY + this.eyeH + bobY - this.landDip, z);
    const side = m.vx * Math.cos(yaw) - m.vz * Math.sin(yaw);
    this.roll += (-side * 0.0015 - this.roll) * (1 - Math.exp(-dt * 9));
    cam.rotation.set(pitch, yaw, this.roll, 'YXZ');
    // Speed reads through the edges of the view.
    const fov = 70 + (this.input.buttons & Btn.Sprint && speed > PLAYER.walk ? 6 * pace : 0);
    if (Math.abs(cam.fov - fov) > 0.02) { cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 7)); cam.updateProjectionMatrix(); }
    const quake = st.env.quake;
    if (quake > 0) this.shake = Math.max(this.shake, quake * 0.8);
    if (this.shake > 0.001) {
      this.shake *= Math.exp(-dt * 1.4);
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.05; cam.position.y += (Math.random() - 0.5) * this.shake * 0.06;
    }
    cam.position.x += Math.cos(this.input.yaw) * bobX; cam.position.z -= Math.sin(this.input.yaw) * bobX;

    if (this.dead) this.deathCamera(dt, x, y, z);
    cam.updateMatrixWorld();

    // Are we under rock?
    const ground = this.world.heightAt(x, z);
    const under = ground > y + 2.6 ? 1 : 0;
    this.caveF += (under - this.caveF) * Math.min(1, dt * 1.6);
    const showOutside = this.caveF < 0.97 || x > this.world.meta.mouth.x - 80;
    this.flora.group.visible = showOutside;
    this.terrain.group.visible = showOutside;
    this.water.group.visible = showOutside || x > this.world.meta.mouth.x - 140;

    // Snapshots arrive 20 times a second. Ease between them so a racing sun does not tick.
    const gap = ((this.dayT - this.skyT + 1.5) % 1) - 0.5;
    this.skyT = (this.skyT + gap * (1 - Math.exp(-dt * 12)) + 1) % 1;
    const phase = phaseAt(this.skyT);
    this.sky.apply(phase, this.snap?.weather ?? 0, this.caveF, this.stage);
    // Image lighting knows nothing of rock overhead: fade it out with distance from the mouth.
    const mouth = this.world.meta.mouth;
    const inward = THREE.MathUtils.smoothstep(Math.hypot(x - mouth.x, z - mouth.z), 8, 42);
    this.stage.scene.environmentIntensity *= 1 - this.caveF * inward * 0.995;
    this.terrain.update(cam);
    this.flora.update(cam);
    this.props.update(cam);
    this.creatures.flashlightOn.value = this.lightOn ? 1 : 0;
    this.creatures.update(dt, cam, now);
    if (this.arms) {
      const look = dt > 0 ? 1 / dt : 0;
      this.arms.update(dt, { bob: this.bob, speed: pace * 1.5 + (speed > 0.3 ? 0.3 : 0), lookX: (yaw - this.lastYaw) * look * 0.1, lookY: (pitch - this.lastPitch) * look * 0.1 });
      this.lastYaw = yaw; this.lastPitch = pitch;
    }
    this.fires.update(this.fireFuel, now);
    this.structures.update(dt, now);
    this.structures.setRift(st.env.rift);
    this.structures.carry(m.x, m.y, m.z, this.riding && this.riverEdge() < 2);
    this.atmosphere.update(dt, cam, st.env, this.snap?.weather ?? 0, this.caveF);
    this.water.setFlood(this.snap?.weather ?? 0);
    for (const o of this.others.values()) {
      const r = o.person.root;
      r.position.x += (o.x - r.position.x) * Math.min(1, dt * 12); r.position.y += (o.y - r.position.y) * Math.min(1, dt * 12); r.position.z += (o.z - r.position.z) * Math.min(1, dt * 12);
      r.rotation.y = o.yaw + Math.PI;
      o.person.mixer.update(dt);
      if (o.light) { o.light.position.set(o.x, o.y + 1.5, o.z); o.light.target.position.set(o.x - Math.sin(o.yaw) * 10, o.y + 1, o.z - Math.cos(o.yaw) * 10); }
    }

    // Flashlight with a hint of hand lag.
    const battery = this.snap?.self.battery ?? 100;
    const f = this.flash;
    // The beam leaves the lens. With the torch packed away it comes from about chest height.
    const lens = this.arms?.held === 'flashlight' ? this.arms.lens : null;
    if (lens) lens.getWorldPosition(f.position);
    else f.position.copy(cam.position).add(new THREE.Vector3(0.14, -0.34, -0.3).applyQuaternion(cam.quaternion));
    const aim = new THREE.Vector3(0, 0, -12).applyQuaternion(cam.quaternion).add(cam.position);
    f.target.position.lerp(aim, Math.min(1, dt * 16));
    const weak = battery < 18 ? 0.45 + 0.55 * Math.abs(Math.sin(now * 0.013) * Math.sin(now * 0.0037)) : 1;
    // Close surfaces would burn out under a fixed beam, so ease it as a wall comes near.
    const fw = aim.clone().sub(cam.position).normalize();
    const wall = this.collision.rayDistance(cam.position.x, cam.position.y, cam.position.z, fw.x, fw.y, fw.z, 12);
    this.beam += (Math.max(0.14, Math.min(1, (wall / 8) ** 1.5)) - this.beam) * Math.min(1, dt * 7);
    f.intensity = this.lightOn ? (230 + battery * 1.5) * weak * this.beam : 0;

    // A burning torch throws its own unsteady light.
    if (this.torchLight) {
      const lit = this.arms?.held === 'torch' ? this.arms.lens : null;
      if (lit) lit.getWorldPosition(this.torchLight.position);
      this.torchLight.intensity = lit ? 8 + 2.5 * Math.sin(now * 0.021) * Math.sin(now * 0.0133) : 0;
    }

    if (st.env.era) {
      // 1969. The flicker light doubles as the work lamps: lights are never added mid-game, or every shader rebuilds.
      const a = this.world.meta.features.array;
      if (a) { this.flicker.position.set(a.x + 11, a.y + 2.4, a.z + 5); this.flicker.distance = 46; this.flicker.intensity = 260; }
    } else if (this.props.props.has('flashlight')) {
      // Dead air, then a stutter of filament light.
      this.flickerT -= dt;
      if (this.flickerT < -0.5) this.flickerT = 0.25 + Math.random() * 1.5;
      this.flicker.intensity = this.flickerT > 0 ? 0 : 3.5 * Math.abs(Math.sin(now * 0.09) * Math.sin(now * 0.031));
    } else this.flicker.intensity = 0;

    const sn = this.snap;
    const fear = sn ? sn.self.fear / 100 : 0;
    const fx = this.stage.fx;
    fx.fear.value += (fear - fx.fear.value) * Math.min(1, dt * 2);
    fx.pulse.value = 0.5 + 0.5 * Math.sin(now * 0.006 * (1 + fear * 1.6));
    fx.blood.value += ((sn && sn.self.health < 45 ? (45 - sn.self.health) / 45 : 0) - fx.blood.value) * Math.min(1, dt * 2);

    this.stage.render();
    if (this.dead && !this.polaroidTaken && this.deathT > 1.3) this.takePolaroid();
    this.stage.adapt(Math.min(0.2, (now - this.frameStart) / 1000));
    this.frameStart = now;

    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    this.audio.listener(cam.position.x, cam.position.y, cam.position.z, fwd.x, fwd.y, fwd.z);
    // Birds sing hardest around first and last light.
    const hours = this.dayT % 1, ss = THREE.MathUtils.smoothstep;
    const chorus = Math.max(ss(hours, 0.17, 0.22) * (1 - ss(hours, 0.29, 0.34)), ss(hours, 0.68, 0.72) * (1 - ss(hours, 0.77, 0.81)));
    this.audio.environment({ dayMix: phase.day, night: phase.night, chorus, cave: this.caveF, river: this.riverNear(), tension: sn?.tension ?? 0, fear: sn?.self.fear ?? 0, dt, listenerY: cam.position.y });

    // At high fear the mind starts supplying its own sounds, always just behind you.
    if ((sn?.self.fear ?? 0) > 72) {
      this.fakeT -= dt;
      if (this.fakeT < 0) {
        this.fakeT = 9 + Math.random() * 16;
        this.audio.play(Math.random() < 0.6 ? 'raptor_chirp' : 'twig', cam.position.x - fwd.x * 6 + (Math.random() - 0.5) * 3, cam.position.y, cam.position.z - fwd.z * 6, 0.7);
      }
    }

    this.guide.frame();
    this.hudT += dt;
    if (this.hudT > 0.16) { this.guide.tick(this.hudT); this.glints.set(this.guide.glints); this.hudT = 0; this.pushHud(); }
  };

  private riding = false;
  private eyeH: number = PLAYER.eye;
  private correction = new THREE.Vector3();
  private moveScale = 1;
  private footY = 0;
  private landDip = 0;
  private roll = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private torchLight: THREE.PointLight | null = null;

  private deathCamera(dt: number, x: number, y: number, z: number) {
    this.deathT += dt / Math.max(0.1, this.slowMo);
    const cam = this.stage.camera, t = this.deathT;
    const fx = this.stage.fx;
    fx.blood.value = Math.min(1, t * 0.6);
    // Third-person pull-out, then the ground rushes up.
    const a = this.input.yaw + 0.6 + t * 0.12, r = 1.2 + Math.min(t, 2.4) * 1.1;
    const h = Math.max(0.35, 1.5 - t * 0.5);
    cam.position.set(x + Math.sin(a) * r, y + h, z + Math.cos(a) * r);
    let nearest: THREE.Vector3 | null = null, best = 1e9;
    for (const c of this.creatures.actors.values()) { const d = c.pos.distanceTo(cam.position); if (d < best) { best = d; nearest = c.pos; } }
    const look = nearest && best < 18 ? new THREE.Vector3(nearest.x, nearest.y + (this.deathKiller === 'trex' ? 4.6 : 0.9), nearest.z) : new THREE.Vector3(x, y + 0.3, z);
    cam.lookAt(look);
    this.slowMo = t > 3 ? 0.1 : 0.3;
    if (t > 3.6) fx.blackout.value = Math.min(1, (t - 3.6) * 1.6);
    if (t > 4.6 && this.store.screen === 'play') {
      this.store.polaroid = this.polaroidShot;
      this.store.screen = 'dead';
      this.input.unlock();
    }
    void dt;
  }
  private polaroidShot = '';
  private polaroidTaken = false;

  private pushHud() {
    const st = this.store, sn = this.snap;
    if (sn) {
      const me = sn.self;
      st.health = me.health; st.stamina = me.stamina; st.hunger = me.hunger; st.thirst = me.thirst; st.heat = me.heat; st.fear = me.fear; st.battery = me.battery; st.bleeding = me.bleeding; st.fever = me.fever; st.film = me.film;
      st.phase = phaseName(sn.time);
    }
    this.findTarget();
    st.prompt = this.target && !st.workLabel ? this.target.label : '';
    st.locked = this.input.locked || !this.pointerEverLocked;
    if (this.input.locked) this.pointerEverLocked = true;
    if (this.input.buttons & Btn.Sprint) this.guide.did.sprint = true;
    if (this.input.buttons & Btn.Crouch) this.guide.did.crouch = true;
    const nowMs = performance.now();
    this.worldPings = this.worldPings.filter((q) => q.until > nowMs);
    const v = new THREE.Vector3();
    st.pings = this.worldPings.flatMap((q) => {
      v.set(q.x, q.y, q.z).project(this.stage.camera);
      return v.z < 1 ? [{ x: (v.x * 0.5 + 0.5) * 100, y: (0.5 - v.y * 0.5) * 100, kind: q.kind, id: q.id }] : [];
    });
    if (st.line && performance.now() > st.lineUntil) st.line = '';
    const r = this.stage.renderer.info.render;
    st.stats = { fps: Math.round(this.fpsN / Math.max(this.fpsT, 0.001)), frame: 0, tris: r.triangles, calls: r.drawCalls, backend: this.stage.backend, preset: this.stage.preset };
    this.fpsT = 0; this.fpsN = 0;
  }

  /** Test and benchmark hooks. */
  debug() { return { me: this.me, snap: this.snap, stage: this.stage, store: this.store, dayT: this.dayT, input: this.input }; }

  dispose() {
    this.running = false;
    this.link?.close();
    this.input.dispose();
    this.input.unlock();
    this.audio.ctx.close();
  }
}

