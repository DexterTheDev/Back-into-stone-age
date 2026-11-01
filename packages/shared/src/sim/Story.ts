/**
 * The running story: mission logic from mission 11 on, everything players build, side missions,
 * who lives on each map, and how the game ends. The first ten missions live in GameSim.
 * Each mission reports a checklist. When every line is done, the story moves on.
 */
import { CACHES, CHAPTER3_LIMIT_DAYS, CLUES, FILM, IMPACT_GRACE_DAYS, MISSIONS, PAGES, PHOTO_SUBJECTS, SIDES, missionIndex, type EndingId, type MapId } from '../data/story.ts';
import { ITEMS, type ItemId } from '../data/items.ts';
import { PROPS } from '../data/props.ts';
import { SPECIES, type SpeciesId } from '../data/species.ts';
import type { EnvView, NpcView, SpotView, StepView, StorySave, WidgetView } from '../net/protocol.ts';
import type { GameSim, SimPlayer } from './GameSim.ts';
import type { Dino } from './ai.ts';
import { NIGHTFALL, SUNSET_SECONDS } from './time.ts';

export interface BuildStage { label: string; needs: Partial<Record<ItemId, number>>; seconds: number; noise: number; /** Two people, or one with a lever. */ two?: boolean; /** Okafor's own work: others go slowly from her notes. */ okafor?: boolean }
export interface Structure { id: string; map: MapId; at: string; stages: BuildStage[]; after?: number; solid?: { hw: number; hh: number; ht: number } }

const S = (id: string, map: MapId, at: string, stages: BuildStage[], after = 0, solid?: Structure['solid']): Structure => ({ id, map, at, stages, after, solid });
const st = (label: string, needs: Partial<Record<ItemId, number>>, seconds: number, noise: number, extra: Partial<BuildStage> = {}): BuildStage => ({ label, needs, seconds, noise, ...extra });

export const STRUCTURES: Structure[] = [
  S('door', 'hollow', 'door', [
    st('Raise the log frame', { pole: 6, rope: 3 }, 12, 30),
    st('Weave the lattice', { branch: 6, fiber: 6 }, 10, 8),
    st('Hang the counterweight', { stone: 4, rope: 1 }, 10, 20, { two: true }),
    st('Hide it under moss and mud', { moss: 4, clay: 3 }, 8, 3),
  ], 14),
  S('seal', 'hollow', 'seal', [
    st('Wedge poles across the tunnel', { pole: 3, rope: 2 }, 9, 20),
    st('Pack it with stone and clay', { stone: 3, clay: 2 }, 8, 15),
  ], 15),
  S('lookout', 'hollow', 'lookout', [st('Build a lookout platform', { pole: 3, rope: 2 }, 10, 15)], 11),
  S('weir', 'hollow', 'weir', [st('Stack a stone weir', { stone: 6 }, 12, 8)], 11),
  S('raft', 'valley', 'raft_site', [
    st('Lash logs into a raft', { pole: 6, rope: 4 }, 14, 25),
    st('Cut a push pole', { pole: 1 }, 4, 15),
    st('Launch it', {}, 5, 12, { two: true }),
  ], 17),
  S('fwd_ring', 'valley', 'fwd_ring', [st('Lay a fire ring', { stone: 4, tinder: 2, wood: 3 }, 7, 8)], 23),
  S('fwd_barricade', 'valley', 'fwd_barricade', [st('Drive in the stake barricade', { stake: 6 }, 12, 25)], 23),
  S('fwd_hollow', 'valley', 'fwd_hollow', [st('Dig a hidden sleeping hollow', { branch: 3, moss: 3 }, 9, 5)], 23),
  S('garden', 'valley', 'garden', [st("Plant Hale's medicine garden", { moss: 2, bark: 2, clay: 2 }, 8, 3)], 23),
  S('hot_ring', 'ridge', 'hot_ring', [st('Lay a fire ring on the ledge', { stone: 3, tinder: 2, wood: 3 }, 7, 8)], 34),
  S('furnace', 'ridge', 'furnace', [st('Build a clay furnace', { clay: 6, stone: 4 }, 16, 12)], 39),
  S('mast', 'ridge', 'mast', [st('Haul the mast up with ropes', { rope: 6 }, 18, 30, { two: true })], 41),
  S('array_ring', 'ridge', 'array', [
    st('Mount the four shards', { shard: 4 }, 12, 6, { okafor: true }),
    st('Wind wire around the ring', { wire: 6 }, 14, 8, { okafor: true }),
    st('Run the line to the mast', { wire: 2 }, 8, 6, { okafor: true }),
  ], 42),
  S('ground', 'ridge', 'ground', [st('Drive the copper spike into the spring', { copper_spike: 1 }, 7, 30)], 44),
  S('barricade_1', 'ridge', 'barricade_1', [st('Raise a barricade', { stake: 4 }, 9, 25)], 45),
  S('barricade_2', 'ridge', 'barricade_2', [st('Raise a barricade', { stake: 4 }, 9, 25)], 45),
  S('barricade_3', 'ridge', 'barricade_3', [st('Raise a barricade', { stake: 4 }, 9, 25)], 45),
  S('summit_ring', 'ridge', 'summit_ring', [st('Lay the summit fire ring', { stone: 3, tinder: 2, wood: 3 }, 7, 8)], 45),
  S('trap_1', 'ridge', 'trap_1', [st('Set a snare line', { snare: 1 }, 4, 3)], 45),
  S('trap_2', 'ridge', 'trap_2', [st('Set a snare line', { snare: 1 }, 4, 3)], 45),
];

const STRUCT = new Map(STRUCTURES.map((s) => [s.id, s]));
const needsText = (n: Partial<Record<ItemId, number>>) => Object.entries(n).map(([k, v]) => `${v} ${ITEMS[k as ItemId].name.toLowerCase()}`).join(', ');
const TAPE_SPOTS: [string, string, string][] = [['array', 'tape_array', 'hollow'], ['footprint', 'tape_print', 'hollow'], ['crystal', 'tape_deep', 'hollow'], ['nest', 'tape_nest', 'hollow'], ['lookout', 'tape_ridge', 'hollow']];
const SNARES = ['snare_1', 'snare_2', 'snare_3'];

type Step = StepView;
interface Logic { enter?(s: Story): void; steps(s: Story): Step[]; how?(s: Story): string | undefined }
const step = (text: string, done: boolean, at?: Step['at'] | null, extra: Partial<Step> = {}): Step => ({ text, done, ...(at ? { at } : {}), ...extra });
const count = (label: string, have: number, need: number) => `${label} ${Math.min(have, need)} of ${need}`;

export class Story {
  flags = new Set<string>();
  counters: Record<string, number> = { film: FILM, photos: 0, caches: 0, pages: 0, days: 0, strikes: 0 };
  stage: Record<string, number> = {};
  open: Record<string, boolean> = {};
  sides = new Set<string>();
  shown = new Set<string>();
  npcs: { id: number; character: number; name: string; x: number; y: number; z: number; yaw: number; moving: boolean; follow: boolean }[] = [];
  env: EnvView = { star: 0, copper: 0, aurora: 0, ash: 0, flood: 0, quake: 0, storm: 0, rift: 0, day: 0, era: 0 };
  ending: EndingId | null = null;
  private timers: { at: number; fn: () => void }[] = [];
  private nextTick = 0;
  private lastSteps = '';
  private lastSpots = '';
  private lastEnv = '';
  private lastNpc = '';
  private widgetKey = new Map<number, string>();
  private carcasses: { id: number; x: number; y: number; z: number; until: number; species: SpeciesId }[] = [];
  private nextCarcass = 1;
  private snareAt: Record<string, number> = {};
  private weirAt = 0;
  private lastDay = 0;
  private breach = 0;
  private assaultT = 0;
  private strikeAt = 0;
  private broken: string[] = [];
  private nextNight = 0;
  private quakeAt = 0;
  private recordings = 0;

  constructor(public sim: GameSim) {}

  // ---- reading the world ------------------------------------------------------------------------

  private get meta() { return this.sim.world.blobs.meta; }
  flag(id: string) { return this.flags.has(id); }
  set(id: string) { this.flags.add(id); }
  built(id: string, stage?: number) { const d = STRUCT.get(id)!; return (this.stage[id] ?? 0) >= (stage ?? d.stages.length); }
  have(id: ItemId) { let n = 0; for (const p of this.sim.alive()) n += this.sim.count(p, id); return n; }
  scale(n: number) { return Math.ceil(n * (1 + 0.25 * (this.sim.partySize() - 1))); }
  feat(id: string) { return this.meta.features[id] ?? null; }
  to(id: string, label: string) { const f = this.feat(id); return f ? { x: f.x, y: f.y, z: f.z, label } : null; }
  propAt(id: string, label: string) { const p = this.meta.props.find((q) => q.id === id); return p && !this.sim.takenProps.has(id) ? { x: p.x, y: p.y, z: p.z, label } : null; }
  private lead() { return this.sim.alive()[0] ?? [...this.sim.players.values()][0]; }
  near(id: string, r: number) { const f = this.feat(id); return !!f && this.sim.alive().some((p) => Math.hypot(p.x - f.x, p.z - f.z) < r); }
  nearestNode(kind: string, label: string) {
    const p = this.lead();
    let best: { x: number; y: number; z: number } | null = null, bd = 1e9;
    for (const n of this.meta.nodes) {
      if (n.kind !== kind || !this.sim.liveNodes.has(n.id)) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best ? { x: best.x, y: best.y, z: best.z, label } : null;
  }
  line2(text: string) { this.sim.out(null, { t: 'line', text }); }
  brokenTarget() { const b = this.broken[0]; return b ? this.to(b, 'Burnt coil') : null; }
  river() { const p = this.lead(); const r = this.sim.world.nearestRiver(p.x, p.z); return { x: r.x, y: r.y, z: r.z, label: 'Water' }; }
  private fireTarget() { const f = this.sim.fires.find((q) => q.lit) ?? this.sim.fires[0]; return f ? { x: f.x, y: f.y, z: f.z, label: 'Your fire' } : this.to('firePit', 'Cave mouth'); }
  private doorClosed() { return this.built('door') && !this.open.door; }

  /** True where a finished, closed door or seal stops an animal. */
  walled(x: number, z: number) {
    if (this.sim.mapId !== 'hollow') return false;
    const d = this.feat('door'), e = this.feat('seal');
    if (d && this.doorClosed() && Math.abs(x - d.x) < 1 && Math.abs(z - d.z) < 9) return true;
    if (e && this.built('seal') && !this.flag('breached') && Math.hypot(x - e.x, z - e.z) < 2.4) return true;
    return false;
  }

  /** Firelight behind a shut door is invisible from outside. */
  fireHidden(x: number) { const d = this.feat('door'); return this.sim.mapId === 'hollow' && !!d && this.doorClosed() && x < d.x; }

  safeRespawn() {
    if (this.sim.mapId === 'hollow' && this.built('door')) { const f = this.feat('firePit')!; return { x: f.x - 5, y: f.y + 0.2, z: f.z }; }
    if (this.sim.mapId === 'valley' && this.built('fwd_hollow')) { const f = this.feat('fwd_hollow')!; return { x: f.x, y: f.y + 0.3, z: f.z }; }
    if (this.sim.mapId === 'ridge' && this.built('hot_ring')) { const f = this.feat('hot_ring')!; return { x: f.x + 1.6, y: f.y + 0.3, z: f.z }; }
    return null;
  }

  /** Build progress for the map in play. Each client only draws what stands around it. */
  stagesHere() { return Object.fromEntries(Object.entries(this.stage).filter(([id]) => STRUCT.get(id)?.map === this.sim.mapId)); }

  // ---- mission flow ------------------------------------------------------------------------------

  onMission(index: number) {
    const m = MISSIONS[index];
    if (!m) return;
    LOGIC[m.id]?.enter?.(this);
    this.populate();
    this.lastSteps = '';
    this.refresh();
    this.sim.autosave();
  }

  private after(seconds: number, fn: () => void) { this.timers.push({ at: this.sim.clock + seconds, fn }); }
  private line(text: string, p?: SimPlayer) { this.sim.out(p ? p.id : null, { t: 'line', text, ...(p ? { speaker: p.id } : {}) }); }

  show(...ids: string[]) { for (const id of ids) if (!this.shown.has(id) && !this.sim.takenProps.has(id)) { this.shown.add(id); this.sim.out(null, { t: 'prop_show', id }); } }

  clue(p: SimPlayer | null, id: string) {
    if (!this.sim.addClue(p, id)) return;
    if (id === 'papers' || id === 'roster') this.linkNames(p);
    if (id === 'recorder') this.side('tape', false);
  }

  /** Characters only confirm a discovery after the player has made it. */
  private linkNames(p: SimPlayer | null) {
    if (this.sim.journal.has('papers') && this.sim.journal.has('roster')) this.after(3, () => this.clue(p, 'same_man'));
  }

  side(id: string, done = true) {
    if (!done || this.sides.has(id)) return;
    const s = SIDES.find((q) => q.id === id);
    if (s?.soloOnly && this.sim.players.size > 1) return;
    this.sides.add(id);
    this.sim.out(null, { t: 'side', id });
  }

  /** Called twice a second. */
  tick() {
    const sim = this.sim;
    for (const t of this.timers.splice(0)) { if (sim.clock >= t.at) t.fn(); else this.timers.push(t); }
    if (sim.clock < this.nextTick) return;
    this.nextTick = sim.clock + 0.5;
    if (sim.loading || !sim.alive().length) return;
    this.stepEnv();
    this.stepTraps();
    this.stepPlaces();
    this.stepAssault();
    this.stepStorm();
    this.stepNpcs();
    this.stepWidgets();
    this.stepEpilogue();
    if (sim.clock > this.nextNight) { this.nextNight = sim.clock + 6; this.roster(); }
    this.refresh();
    const m = MISSIONS[sim.mission], logic = m && LOGIC[m.id];
    if (!logic || this.ending || sim.ended) return;
    const steps = logic.steps(this);
    const how = logic.how?.(this) ?? m.how;
    const key = JSON.stringify([steps, how]);
    if (key !== this.lastSteps) { this.lastSteps = key; sim.out(null, { t: 'objective', steps, how }); }
    if (steps.length && steps.every((q) => q.done) && sim.mission < MISSIONS.length - 1) sim.advance();
  }

  private refresh() {
    const list = this.spots();
    const key = JSON.stringify(list);
    if (key !== this.lastSpots) { this.lastSpots = key; this.sim.out(null, { t: 'spots', list }); }
    const npc: NpcView[] = this.npcs.map((n) => ({ id: n.id, character: n.character, name: n.name }));
    const nk = JSON.stringify(npc);
    if (nk !== this.lastNpc) { this.lastNpc = nk; this.sim.out(null, { t: 'npcs', list: npc }); }
  }

  /** Sent to a client that has just arrived. */
  resend() { this.lastSpots = ''; this.lastSteps = ''; this.lastEnv = ''; this.lastNpc = ''; this.widgetKey.clear(); }

  // ---- spots -------------------------------------------------------------------------------------

  private spots(): SpotView[] {
    const out: SpotView[] = [], sim = this.sim, map = sim.mapId, m = sim.mission;
    const add = (id: string, at: { x: number; y: number; z: number } | null, label: string, reach = 3.6) => { if (at) out.push({ id, x: at.x, y: at.y, z: at.z, label, reach }); };
    if (this.env.era) return this.eraSpots(add);
    for (const s of STRUCTURES) {
      if (s.map !== map || m < (s.after ?? 0)) continue;
      const n = this.stage[s.id] ?? 0;
      if (n >= s.stages.length) continue;
      const g = s.stages[n], text = needsText(g.needs);
      add(`build:${s.id}`, this.feat(s.at), `${g.label}${text ? ` · ${text}` : ''}`, s.id === 'door' || s.id === 'seal' ? 5 : 4.2);
    }
    if (map === 'hollow') {
      if (this.built('door')) add('door', this.feat('door'), this.open.door ? 'Close the door' : 'Open the door', 5);
      if (this.built('door')) add('sleep', this.feat('bed'), 'Sleep until morning', 3);
      if (m >= missionIndex('find_food')) {
        for (const id of SNARES) {
          const at = this.snareAt[id];
          if (at === undefined) { if (this.have('snare') > 0) add(`snare:${id}`, this.feat(id), 'Set the snare'); } else if (sim.clock >= at) add(`catch:${id}`, this.feat(id), 'Take what it caught');
        }
      }
      if (this.built('weir') && sim.clock >= this.weirAt) add('weir', this.feat('weir'), 'Take fish from the weir');
      if (m >= missionIndex('follow_marks')) add('pass:valley', this.feat('pass_west'), 'Go through the pass, west', 7);
      if (m >= missionIndex('bring_home') && m <= missionIndex('find_signal')) {
        if (!this.flag('shards_home') && this.have('shard') >= 4) add('stash', this.feat('shard_cache'), 'Set the shards down together');
        if (this.flag('shards_home') && !this.flag('shards_taken')) add('unstash', this.feat('shard_cache'), 'Take the shards');
      }
    }
    if (map === 'valley') {
      add('pass:hollow', this.feat('pass_east'), 'Go back east, to the cave', 7);
      if (this.built('raft')) { add('raft:west', this.feat('raft_site'), 'Pole across', 6); add('raft:east', this.feat('raft_land'), 'Pole back across', 6); }
      if (m >= missionIndex('repair_radio') && !this.flag('radio_fixed') && this.have('field_radio') > 0) add('radio_fix', this.feat('radio_bench'), 'Give the radio the flashlight batteries');
      if (m >= missionIndex('find_calloway')) add('ladder', this.feat('ladder'), 'Climb the rope ladder', 3.5);
      if (this.flag('climbed')) add('ladder_down', this.feat('ladder_top'), 'Climb down', 3.5);
      if (this.built('fwd_hollow')) add('sleep', this.feat('fwd_hollow'), 'Sleep until morning', 3);
      if (m >= missionIndex('bone_shard') && !this.flag('bait_set') && this.have('raw_meat') > 0) add('bait', this.feat('bait'), 'Leave fresh meat here', 4);
      if (m >= missionIndex('find_signal')) add('pass:ridge', this.feat('pass_west'), 'Go through the pass, west', 7);
      if (this.built('garden') && sim.clock > (this.counters.gardenAt ?? 0)) add('garden_pick', this.feat('garden'), 'Pick bark and moss');
      if (m >= missionIndex('search_camp')) add('watch_herd', this.feat('herd_view'), 'Watch the herds a while', 5);
    }
    if (map === 'ridge') {
      add('pass:valley_back', this.feat('pass_east'), 'Go back east', 7);
      if (m >= missionIndex('cross_ash')) { add('scarp', this.feat('scarp'), this.flag('pitoned') ? 'Climb the rope' : 'Drive pitons and climb · 4 pitons, 2 rope', 4.5); }
      if (this.flag('pitoned')) add('scarp_down', this.feat('scarp_top'), 'Climb down', 4);
      if (this.built('hot_ring')) add('sleep', this.feat('hot_ring'), 'Sleep until morning', 3);
      if (m === missionIndex('when_rift') && !this.sim.journal.has('aurora')) add('watch_sky', this.feat('summit_watch'), sim.nightness() > 0.6 ? 'Watch the sky' : 'Wait here until dark', 5);
      if (m === missionIndex('raise_mast') && !this.flag('tree_down')) add('fell_tree', this.feat('dead_tree'), 'Fell the tallest dead tree', 5);
      if (m === missionIndex('test_array') && this.env.storm > 0 && !this.flag('test_done')) add('switch', this.feat('switch'), 'Close the switch', 4);
      if (m === missionIndex('hold_storm') && !this.flag('storm_on')) add('switch', this.feat('switch'), 'Close the switch and call the storm', 4);
      for (const b of this.broken) add(`repair:${b}`, this.feat(b), 'Repair the burnt coil · 1 copper wire', 3.5);
      if (m === missionIndex('through_rift')) {
        if (!this.flag('scar_gone')) {
          if (this.have('raw_meat') + this.have('cooked_meat') > 0) add('scar_bait', this.feat('bait_summit'), 'Throw meat down the slope', 5);
          add('scar_tube', this.feat('tube_prop'), 'Knock out the lava tube prop', 4.5);
          add('scar_burn', this.feat('switch'), "Fire the array's discharge", 4);
        } else {
          add('rift', this.feat('rift'), 'Walk into the light', 4);
          if (!this.flag('smashed')) add('smash', this.feat('mount'), 'Smash the Heartstone mount', 3.5);
          add('stay', this.feat('switch'), 'Stay and hold it open', 4);
        }
      }
    }
    for (const c of this.carcasses) add(`carcass:${c.id}`, c, 'Cut meat from it', 3);
    return out;
  }

  private eraSpots(add: (id: string, at: { x: number; y: number; z: number } | null, label: string, reach?: number) => void) {
    const out: SpotView[] = [];
    const a = (id: string, at: { x: number; y: number; z: number } | null, label: string, reach = 3.6) => { add(id, at, label, reach); if (at) out.push({ id, x: at.x, y: at.y, z: at.z, label, reach }); };
    if (this.ending === 'home' || this.ending === 'record') {
      const w = this.npcs[0];
      if (w) a('finish', w, this.ending === 'home' ? 'Hand him the shards' : 'Show him the Polaroids', 3);
    }
    if (this.ending === 'closed') a('finish', this.feat('campSite'), 'Read the newspaper', 4);
    return out;
  }

  // ---- doing things -------------------------------------------------------------------------------

  act(p: SimPlayer, id: string) {
    const sim = this.sim;
    const spot = this.spots().find((q) => q.id === id);
    if (!spot || Math.hypot(spot.x - p.x, spot.z - p.z) > spot.reach + 1.2) return;
    const [kind, arg] = id.split(':');
    switch (kind) {
      case 'build': this.build(p, arg); break;
      case 'door': this.setDoor(!this.open.door); sim.sound('thud', spot.x, spot.y + 1, spot.z, 1); sim.noiseAt(p, spot.x, spot.y, spot.z, 20); break;
      case 'sleep': sim.sleep(p); break;
      // Reyes knows where a run is: his snares fill faster.
      case 'snare': sim.take(p, 'snare', 1); this.snareAt[arg] = sim.clock + (80 + sim.random() * 70) * (p.character === 3 ? 0.6 : 1); break;
      case 'catch': delete this.snareAt[arg]; sim.give(p, 'raw_meat', 1); sim.give(p, 'bone', 1); this.line('Small, hairy and dead. It will do.', p); break;
      case 'weir': this.weirAt = sim.clock + 120; sim.give(p, 'fish', 2); break;
      case 'pass': this.travelTo(p, arg === 'valley_back' ? 'valley' : (arg as MapId)); break;
      case 'stash': sim.take(p, 'shard', 4); this.set('shards_home'); this.onShardsHome(); break;
      case 'unstash': sim.give(p, 'shard', 4); this.set('shards_taken'); break;
      case 'raft': this.raft(p, arg === 'west'); break;
      case 'radio_fix': this.fixRadio(p); break;
      case 'ladder': sim.ride(p, this.climbPath('ladder', 'ladder_top'), 3, () => { this.set('climbed'); this.line('She built all of this alone.', p); }); break;
      case 'ladder_down': sim.ride(p, this.climbPath('ladder_top', 'ladder'), 4, () => {}); break;
      case 'bait': sim.take(p, 'raw_meat', 1); this.set('bait_set'); this.lureScar('bait'); break;
      case 'garden_pick': this.counters.gardenAt = sim.clock + 240; sim.give(p, 'bark', 1); sim.give(p, 'moss', 1); this.side('garden'); break;
      case 'watch_herd': sim.work(p, 8, 'Watching the herds', () => { this.clue(p, 'herds'); this.side('herds'); }); break;
      case 'scarp': this.climbScarp(p); break;
      case 'scarp_down': sim.ride(p, this.climbPath('scarp_top', 'scarp'), 5, () => {}); break;
      case 'watch_sky':
        if (sim.nightness() < 0.6) { this.line('Not yet. It has to be dark.', p); break; }
        sim.work(p, 6, 'Watching the sky', () => { this.env.aurora = 1; this.clue(p, 'aurora'); });
        break;
      case 'fell_tree': this.fellTree(p); break;
      case 'switch': this.closeSwitch(p); break;
      case 'repair': this.repair(p, arg); break;
      case 'scar_bait': this.scarBait(p); break;
      case 'scar_tube': this.scarTube(p); break;
      case 'scar_burn': this.scarBurn(p); break;
      case 'rift': this.enterRift(p); break;
      case 'smash': this.smash(p); break;
      case 'stay': this.stay(p); break;
      case 'finish': this.finish(); break;
      case 'carcass': this.cutCarcass(p, Number(arg)); break;
      default: break;
    }
    this.refresh();
  }

  private climbPath(from: string, to: string) { const a = this.feat(from)!, b = this.feat(to)!; return [{ x: a.x, y: a.y, z: a.z }, { x: a.x, y: b.y + 0.1, z: a.z }, { x: b.x, y: b.y + 0.2, z: b.z }]; }

  private twoNear(p: SimPlayer, at: { x: number; z: number }) { return this.sim.alive().filter((q) => q !== p && Math.hypot(q.x - at.x, q.z - at.z) < 7).length > 0; }

  private build(p: SimPlayer, id: string) {
    const sim = this.sim, d = STRUCT.get(id);
    if (!d) return;
    const n = this.stage[id] ?? 0, g = d.stages[n], at = this.feat(d.at)!;
    if (!g) return;
    for (const [k, v] of Object.entries(g.needs)) if (sim.count(p, k as ItemId) < (v as number)) { this.line(`I need ${v} ${ITEMS[k as ItemId].name.toLowerCase()}.`, p); return; }
    // Solo players stand in for a second pair of hands with a lever.
    if (g.two && !this.twoNear(p, at) && sim.count(p, 'lever') < 1) { this.line(sim.players.size > 1 ? 'This takes two of us here at once, or a lever pole.' : 'I need a lever pole to move this alone.', p); return; }
    const notes = g.okafor ? (p.character === 1 ? 0.6 : sim.players.size > 1 || p.character !== 1 ? 1.5 : 1) : 1;
    sim.work(p, g.seconds * notes, g.label, () => {
      if ((this.stage[id] ?? 0) !== n) return;
      for (const [k, v] of Object.entries(g.needs)) { if (!sim.take(p, k as ItemId, v as number)) return; }
      this.stage[id] = n + 1;
      sim.out(null, { t: 'structure', id, stage: n + 1, open: this.open[id] });
      this.applyBlock(id);
      this.onBuilt(id, n + 1, p);
    }, g.noise);
  }

  setDoor(open: boolean) { this.open.door = open; this.applyBlock('door'); this.sim.out(null, { t: 'structure', id: 'door', stage: this.stage.door ?? 0, open }); }

  /** Solid things the sim and every client must agree on. */
  blockFor(id: string, stage: number, open: boolean): { x: number; y: number; z: number; hx: number; hy: number; hz: number; yaw: number } | null {
    const f = this.meta.features;
    if (this.env.era) return null; // none of it has been built yet
    if (id === 'door' && f.door && stage >= 4 && !open) return { x: f.door.x, y: f.door.y + 4, z: f.door.z, hx: 0.5, hy: 5, hz: 7.5, yaw: 0 };
    if (id === 'seal' && f.seal && stage >= 1) return { x: f.seal.x, y: f.seal.y + 2, z: f.seal.z, hx: 0.5, hy: 3, hz: 6, yaw: f.seal.yaw ?? 0 };
    return null;
  }

  applyBlock(id: string) {
    const stage = id === 'seal' && this.flag('breached') ? 0 : this.stage[id] ?? 0;
    const b = this.blockFor(id, stage, !!this.open[id]);
    const c = this.sim.world.collision;
    if (b) c.setBlock(id, true, b.x, b.y, b.z, b.hx, b.hy, b.hz, b.yaw); else c.setBlock(id, false);
  }

  applyMapBlocks() {
    if (this.sim.mapId === 'hollow') for (const id of ['door', 'seal']) this.applyBlock(id);
    if (this.sim.mapId === 'valley') this.sim.world.applyPlatforms();
  }

  private onBuilt(id: string, stage: number, p: SimPlayer) {
    const sim = this.sim, done = stage >= STRUCT.get(id)!.stages.length;
    if (id === 'door' && done) { this.line('From outside it is just a hillside.'); sim.autosave(); }
    if (id === 'seal' && done) this.startAssault();
    if (id === 'lookout' && done) { this.clue(p, 'lookout'); this.side('lookout'); }
    if (id === 'weir') { this.weirAt = sim.clock + 90; this.side('weir'); }
    if ((id === 'fwd_ring' || id === 'hot_ring' || id === 'summit_ring') && done) { const f = this.feat(id)!; sim.addFire(f.x, f.y, f.z); }
    if (id === 'fwd_hollow' && done) { this.line('Nothing will find this unless it steps on it.'); sim.autosave(); }
    if (id === 'garden' && done) { this.counters.gardenAt = sim.clock + 200; this.side('garden'); }
    if (id === 'furnace' && done) this.set('furnace_lit');
    if (id === 'ground' && done) this.line('The needle stopped shaking.');
    if (id === 'array_ring' && stage === 1) this.line('They came alive the moment they touched the mount.');
  }

  onGather(p: SimPlayer, kind: string) {
    if (kind === 'pyrite' && !this.sim.journal.has('pyrite')) this.clue(p, 'pyrite');
    if (kind === 'bark' && !this.sim.journal.has('bark')) this.clue(p, 'bark');
  }

  onCraft(p: SimPlayer, id: ItemId) {
    if (id === 'striker') this.side('striker');
    if (id === 'poultice') this.side('medicine');
    if (id === 'spear' || id === 'sling') this.side('weapons');
    if (id === 'strong_poultice') this.side('remedies');
    if (id === 'copper' && this.sim.nightness() > 0.4) this.set('glow');
    void p;
  }

  onUse(p: SimPlayer, id: ItemId) {
    if (id === 'boiled_water') this.set('drank_boiled');
    if (id === 'cooked_meat' || id === 'cooked_fish') this.set('ate');
    if (id === 'mud_paste') p.scentUntil = this.sim.clock + 240;
    if (id === 'smoke_bomb') this.sim.smoke(p);
  }

  /** Hollow, deep in the cave: the compass needle has been pointing here all along. */
  onProp(p: SimPlayer, id: string) {
    const sim = this.sim, def = PROPS[id];
    if (id === 'crate') { if (!this.flag('crate')) { this.set('crate'); sim.give(p, 'camera', 1); this.clue(p, 'crate'); } return; }
    if (id === 'moss_curtain') { sim.takeProp(id); this.show('scratched'); this.line('There is something behind it.', p); return; }
    if (id === 'kill') { this.stealKill(p); return; }
    if (id === 'swamp_cry') { this.rescue(p); return; }
    if (id === 'dug_grave') { sim.work(p, 9, 'Filling in the grave', () => { sim.takeProp(id); sim.give(p, 'locket', 1); this.clue(p, 'locket'); this.side('bury'); this.line('Something came up with the earth.', p); }, 6); return; }
    if (id.startsWith('grave_')) { this.clue(p, 'graves'); this.show('dug_grave'); return; }
    if (id.startsWith('cache_')) { this.openCache(p, id); return; }
    if (id === 'last_cache') { sim.give(p, 'cooked_meat', 2); sim.give(p, 'poultice', 1); sim.give(p, 'torch', 1); this.side('last_cache'); }
    if (id === 'fate') this.side('last_teammate');
    if (id === 'glasses') {
      this.side('glasses');
      // June cannot find her own glasses. For her it is somebody else's.
      if (p.character === 1) { sim.takeProp(id); this.clue(p, 'tags'); return; }
    }
    if (id === 'crystal') this.side('compass');
    if (id.startsWith('page_')) this.counters.pages = (this.counters.pages ?? 0) + 1;
    if (id === 'shard_flats' && sim.nightness() > 0.3) { this.line('Too dark to find anything among all this bone.', p); return; }
    if (id.startsWith('shard_')) {
      this.counters.shards = (this.counters.shards ?? 0) + 1;
      if (id === 'shard_den') this.widowReturns(p);
      if (id === 'shard_flats' && this.have('compass') > 0) this.line('The needle will not stop spinning.', p);
    }
    if (id === 'calloway_map') this.show(...Array.from({ length: CACHES }, (_, i) => `cache_${i + 1}`));
    if (def.clue) this.clue(p, def.clue);
    if (def.pick) sim.give(p, def.pick, 1);
    if (!def.stays) sim.takeProp(id);
  }

  private openCache(p: SimPlayer, id: string) {
    const sim = this.sim, n = Number(id.slice(6));
    sim.takeProp(id);
    this.clue(p, `cache_${n}`);
    this.counters.caches = (this.counters.caches ?? 0) + 1;
    const loot: [ItemId, number][] = [['tinder', 3], ['cooked_fish', 2], ['moss', 3], ['cartridge', 6], ['bark', 3], ['rope', 2], ['poultice', 1], ['wood', 4], ['stone', 3], ['boiled_water', 2], ['torch', 1], ['cooked_meat', 2]];
    const [item, k] = loot[n - 1];
    sim.give(p, item, k);
    if (n === 4) { sim.give(p, 'rifle', 1); this.side('rounds'); }
    if (n === 3) this.clue(p, 'calloway_weapons');
    if ((this.counters.caches ?? 0) >= CACHES) this.side('caches');
  }

  // ---- traps and food -----------------------------------------------------------------------------

  private stepTraps() {
    this.carcasses = this.carcasses.filter((c) => c.until > this.sim.clock);
  }

  /** Things that happen simply by going somewhere. Nothing tells players to go. */
  private stepPlaces() {
    const sim = this.sim, map = sim.mapId, lead = sim.alive()[0];
    if (map === 'hollow' && this.near('nest', 46) && !sim.journal.has('nest')) {
      this.clue(lead, 'nest');
      this.side('nest');
      if (sim.players.size === 1) { this.show('glasses'); this.line('Something is shining down there.', lead); }
    }
    if (map === 'ridge' && this.near('hot_ring', 40) && !sim.journal.has('hot_remedy')) this.clue(lead, 'hot_remedy');
    // The nest in the tubes counts as cleared once nothing small is left alive down there.
    if (map === 'ridge' && this.flag('nest_woken') && !this.sides.has('nest_clear') && !sim.dinos.some((d) => d.species === 'pectinodon')) this.side('nest_clear');
    // Nothing the story waits on may depend on a timer that a reload would lose.
    if (map === 'hollow' && this.flag('shards_home') && !this.flag('voice')) this.onShardsHome();
    if (map === 'ridge' && sim.mission === missionIndex('through_rift') && !this.flag('scar_gone') && !this.flag('scar_fading')) this.spawnScar();
  }

  addCarcass(d: Dino) { this.carcasses.push({ id: this.nextCarcass++, x: d.x, y: d.y, z: d.z, until: this.sim.clock + 150, species: d.species }); }

  private cutCarcass(p: SimPlayer, id: number) {
    const c = this.carcasses.find((q) => q.id === id);
    if (!c) return;
    this.sim.work(p, 3, 'Cutting', () => {
      if (!this.carcasses.includes(c)) return;
      this.carcasses = this.carcasses.filter((q) => q !== c);
      this.sim.give(p, 'raw_meat', c.species === 'pectinodon' || c.species === 'didelphodon' ? 1 : 2);
      this.sim.give(p, 'bone', 1);
      p.bleeding = Math.max(p.bleeding, 6);
    });
  }

  /** The kill belongs to something. Taking from it starts a clock. */
  private stealKill(p: SimPlayer) {
    const sim = this.sim;
    if (this.flag('kill_taken')) { this.line('There is nothing left worth the risk.', p); return; }
    sim.work(p, 4, 'Cutting meat', () => {
      this.set('kill_taken');
      sim.give(p, 'raw_meat', 2);
      const k = this.meta.props.find((q) => q.id === 'kill')!;
      sim.scarAt(p, 'Something that big does not leave food for long.');
      sim.sound('trex_far', k.x + 90, k.y + 6, k.z - 40, 1);
    }, 6);
  }

  // ---- the first assault --------------------------------------------------------------------------

  private startAssault() {
    const sim = this.sim;
    if (this.flag('assault')) return;
    this.set('assault');
    this.line('That will have to hold.');
    sim.bringDark();
    this.assaultT = sim.clock;
  }

  private stepAssault() {
    const sim = this.sim;
    if (!this.flag('assault') || this.flag('assault_over') || sim.mapId !== 'hollow') return;
    const f = this.meta.features;
    if (sim.time < NIGHTFALL && sim.time > 0.2) return;
    if (this.flag('tested') && !this.breach && !this.flag('breached')) this.breach = sim.clock + 30; // back from a saved game
    if (!this.flag('tested')) {
      this.set('tested');
      sim.spawnPackAt('raptor', 4 + sim.partySize() - 1, f.door.x + 24, f.door.z, 'door');
      this.line('They are at the door.');
      this.breach = sim.clock + 75;
    }
    if (sim.time >= NIGHTFALL && Math.floor(sim.clock) % 9 === 0) { sim.sound('thud', f.door.x + 1, f.door.y + 2, f.door.z, 0.9); sim.fearAll(2); }
    if (this.breach && sim.clock > this.breach && !this.flag('breached')) {
      this.set('breached');
      this.stage.seal = 1;
      this.applyBlock('seal');
      sim.out(null, { t: 'structure', id: 'seal', stage: 1 });
      sim.sound('crash', f.seal.x, f.seal.y + 1, f.seal.z, 1);
      this.line('The tunnel. They are in the tunnel.');
      sim.spawnPackAt('raptor', 3 + sim.partySize() - 1, f.tunnel_out.x, f.tunnel_out.z, 'seal');
      sim.fearAll(30);
    }
    if (sim.time < 0.04 && this.flag('tested')) {
      this.set('assault_over');
      sim.clearHunters();
      // Stone and clay are only as good as what is left of them by morning.
      this.stage.seal = 2;
      this.flags.delete('breached');
      this.applyBlock('seal');
      sim.out(null, { t: 'structure', id: 'seal', stage: 2 });
      this.line('They are going. It held.');
      sim.autosave();
    }
  }

  // ---- crossings ----------------------------------------------------------------------------------

  private travelTo(p: SimPlayer, map: MapId) {
    const sim = this.sim;
    const f = this.feat(map === 'valley' ? (sim.mapId === 'hollow' ? 'pass_west' : 'pass_east') : map === 'hollow' ? 'pass_east' : 'pass_west')!;
    if (sim.alive().some((q) => Math.hypot(q.x - f.x, q.z - f.z) > 40)) { this.line('Everyone has to be here first.', p); return; }
    const entry = sim.mapId === 'hollow' ? 'pass_east' : sim.mapId === 'ridge' ? 'pass_west' : map === 'hollow' ? 'pass_west' : 'pass_east';
    sim.travel(map, entry);
  }

  /** On arrival, after the new world is live. */
  onMapEntered(map: MapId) {
    this.resend();
    this.applyMapBlocks();
    this.populate();
    const m = this.sim.mission;
    if (map === 'valley' && m === missionIndex('follow_marks')) this.show('arrow_v1', 'arrow_v2', 'arrow_v3');
    if (map === 'ridge' && m <= missionIndex('find_signal')) { this.sim.advanceTo(missionIndex('follow_signal')); this.counters.ch3Start = this.counters.days ?? 0; }
    if (map === 'hollow' && this.flag('shards_home') && !this.flag('voice')) this.onShardsHome();
    // A new map is always worth saving, however recent the last save was.
    this.sim.autosave(true);
  }

  private raft(p: SimPlayer, west: boolean) {
    const a = this.feat(west ? 'raft_site' : 'raft_land')!, b = this.feat(west ? 'raft_land' : 'raft_site')!;
    this.sim.sound('feed', p.x, p.y, p.z, 1);
    this.sim.ride(p, [{ x: a.x, y: a.y + 0.5, z: a.z }, { x: b.x, y: b.y + 0.5, z: b.z }], 3.4, () => { if (west) this.set('crossed'); });
  }

  private fixRadio(p: SimPlayer) {
    const sim = this.sim;
    if (sim.count(p, 'flashlight') < 1) { this.line('Whoever has the flashlight has the batteries.', p); return; }
    sim.work(p, 5, 'Moving the batteries over', () => {
      p.battery = 0; p.lightOn = false;
      this.set('radio_fixed');
      this.clue(p, 'radio_tone');
      this.line('That was the last of the light.');
    });
  }

  // ---- the valley ---------------------------------------------------------------------------------

  private rescue(p: SimPlayer) {
    const sim = this.sim, f = this.meta.props.find((q) => q.id === 'swamp_cry')!;
    sim.work(p, 4, 'Getting them up', () => {
      sim.takeProp('swamp_cry');
      this.clue(p, 'rescue');
      this.side('trouble');
      const other = [0, 1, 2, 3].filter((c) => c !== p.character)[1];
      this.npcs.push({ id: 201, character: other, name: ['Varga', 'Okafor', 'Hale', 'Reyes'][other], x: f.x, y: f.y, z: f.z, yaw: 0, moving: false, follow: true });
      // With the party for one mission.
      this.set('helper'); this.counters.helperUntil = sim.mission + 2;
    });
  }

  private lureScar(at: string) {
    const f = this.feat(at)!;
    const d = this.sim.dinos.find((q) => q.species === 'trex');
    if (!d) return;
    d.goal = { x: f.x, y: f.y, z: f.z };
    d.mode = 'investigate'; d.modeTime = 0; d.path = [];
    this.sim.sound('trex_far', f.x, f.y + 6, f.z, 1);
    this.after(70, () => this.flags.delete('bait_set'));
  }

  private widowReturns(p: SimPlayer) {
    const sim = this.sim, f = this.feat('den_mouth');
    this.line('She will smell that I was here.', p);
    if (!f) return;
    this.after(45, () => {
      if (sim.mapId !== 'valley') return;
      const d = sim.dinos.find((q) => q.species === 'widow') ?? sim.spawnSolo('widow', f.x + 60, f.z - 30);
      sim.huntPlayer(d, p);
      sim.sound('raptor_call', d.x, d.y, d.z, 1.4);
    });
  }

  onShardsHome() {
    const sim = this.sim;
    if (this.flag('voice')) return;
    this.set('voice');
    this.after(4, () => {
      this.line('RADIO: "This is Abel Whitcombe. It\'s 1969. If you can hear me, bring them to the ridge."');
      sim.sound('radio_voice', this.lead().x, this.lead().y + 1.4, this.lead().z, 1);
      this.clue(this.lead(), 'signal_voice');
      if (sim.journal.has('papers') && sim.journal.has('roster')) this.after(5, () => this.clue(this.lead(), 'both_docs'));
      this.counters.voiceAt = sim.clock;
      this.env.star = Math.max(this.env.star, 0.04);
    });
  }

  // ---- the ridge ----------------------------------------------------------------------------------

  private climbScarp(p: SimPlayer) {
    const sim = this.sim;
    if (this.flag('pitoned')) { sim.ride(p, this.climbPath('scarp', 'scarp_top'), 3, () => {}); return; }
    if (sim.count(p, 'piton') < 4 || sim.count(p, 'rope') < 2) { this.line('Four pitons and two lengths of rope, or it is not safe.', p); return; }
    sim.work(p, 8, 'Driving pitons', () => {
      if (!sim.take(p, 'piton', 4) || !sim.take(p, 'rope', 2)) return;
      this.set('pitoned');
      sim.ride(p, this.climbPath('scarp', 'scarp_top'), 3, () => {});
    }, 18);
  }

  private fellTree(p: SimPlayer) {
    const sim = this.sim;
    if (sim.count(p, 'hand_axe') < 1) { this.line('I need an axe for this.', p); return; }
    sim.work(p, 16, 'Felling the dead tree', () => {
      this.set('tree_down');
      const f = this.feat('dead_tree')!;
      sim.noiseAt(p, f.x, f.y, f.z, 80);
      sim.sound('crash', f.x, f.y + 3, f.z, 1);
    }, 40);
  }

  private closeSwitch(p: SimPlayer) {
    const sim = this.sim, f = this.feat('switch')!, m = sim.mission;
    if (m === missionIndex('test_array')) {
      this.set('test_done');
      this.strike(f, 1);
      this.clue(p, 'test_fired');
      sim.spawnPackAt('raptor', 3 + sim.partySize(), f.x + 80, f.z + 30, 'hunt');
      sim.spawnPackAt('pectinodon', 3, f.x - 60, f.z + 40, 'hunt');
      sim.fearAll(25);
      this.after(55, () => { this.set('test_survived'); this.env.storm = 0; this.line('It is quiet. Something in the coil is still ticking.'); });
    } else if (m === missionIndex('hold_storm')) {
      this.set('storm_on');
      this.counters.strikes = 0;
      this.env.storm = 1;
      this.strikeAt = sim.clock + 80;
      sim.bringDark();
      this.line('Here it comes.');
    }
  }

  private strike(f: { x: number; y: number; z: number }, rift: number) {
    const sim = this.sim;
    sim.sound('thunder', f.x, f.y + 40, f.z, 1);
    this.env.rift = rift;
    this.after(rift >= 1 ? 1.2 : 8, () => { if (!this.flag('rift_open')) this.env.rift = 0; });
    sim.noiseAt(null, f.x, f.y, f.z, 260);
  }

  private stepStorm() {
    const sim = this.sim, m = sim.mission;
    if (sim.mapId !== 'ridge') return;
    if (m === missionIndex('test_array') && !this.flag('test_storm') && this.built('array_ring')) {
      this.set('test_storm');
      this.after(25, () => { this.env.storm = 0.45; this.line('Lightning is walking up the ridge.'); });
    }
    if (!this.flag('storm_on') || this.flag('rift_open')) return;
    if (sim.clock > this.strikeAt) {
      this.strikeAt = sim.clock + 150;
      const f = this.feat('switch')!;
      if (this.broken.length) {
        this.counters.strikes = Math.max(0, (this.counters.strikes ?? 0) - 1);
        this.line('The coil was still burnt. That strike went into the ground.');
        this.strike(f, 0.2);
      } else {
        this.counters.strikes = (this.counters.strikes ?? 0) + 1;
        this.strike(f, 0.4 + 0.2 * this.counters.strikes);
        this.line(this.counters.strikes >= 3 ? 'Three. It is staying open.' : this.counters.strikes === 2 ? 'Two. One more.' : 'One.');
      }
      if ((this.counters.strikes ?? 0) >= 3) { this.set('rift_open'); this.env.rift = 1; return; }
      this.broken = ['repair_a', 'repair_b', 'repair_c'].filter(() => sim.random() < 0.6).slice(0, 2);
      if (!this.broken.length) this.broken = ['repair_a'];
      const w = (this.counters.strikes ?? 0);
      sim.spawnPackAt('raptor', 3 + sim.partySize() + w, f.x + 70, f.z - 40, 'hunt');
      if (w >= 1) sim.spawnPackAt('dakotaraptor', 2, f.x - 70, f.z + 30, 'hunt');
      if (w >= 2) sim.spawnSolo('widow', f.x + 60, f.z + 60);
    }
  }

  private repair(p: SimPlayer, id: string) {
    const sim = this.sim;
    if (sim.count(p, 'wire') < 1) { this.line('I need wire.', p); return; }
    sim.work(p, p.character === 1 ? 4 : 7, 'Rewinding the coil', () => { sim.take(p, 'wire', 1); this.broken = this.broken.filter((b) => b !== id); }, 8);
  }

  spawnScar() {
    const sim = this.sim, f = this.feat('summit_edge')!;
    if (sim.dinos.some((q) => q.species === 'trex')) return;
    const d = sim.spawn('trex', { x: f.x, y: sim.world.terrainAt(f.x, f.z), z: f.z }, null);
    d.mode = 'charge';
    sim.sound('trex_roar', f.x, f.y + 8, f.z, 1);
    this.line('Old Scar.');
    sim.fearAll(40);
  }

  private scarBait(p: SimPlayer) {
    const sim = this.sim;
    if (sim.count(p, 'raw_meat') > 0) sim.take(p, 'raw_meat', 1); else sim.take(p, 'cooked_meat', 1);
    const d = sim.dinos.find((q) => q.species === 'trex');
    const f = this.feat('tube_prop')!;
    if (d) { d.goal = { x: f.x, y: f.y, z: f.z }; d.mode = 'investigate'; d.modeTime = -30; d.path = []; }
    this.line('It turned. It actually turned.', p);
    this.set('scar_fading');
    this.after(12, () => this.scarDone());
  }

  private scarTube(p: SimPlayer) {
    const sim = this.sim, f = this.feat('tube_prop')!;
    sim.work(p, 6, 'Knocking out the prop', () => {
      const d = sim.dinos.find((q) => q.species === 'trex');
      sim.sound('crash', f.x, f.y, f.z, 1);
      if (d && Math.hypot(d.x - f.x, d.z - f.z) < 34) { sim.despawn(d); this.scarDone(); this.line('The ground took him.'); } else this.line('Not yet. He has to be on the tube.', p);
    }, 30);
  }

  private scarBurn(p: SimPlayer) {
    const sim = this.sim, f = this.feat('switch')!;
    sim.work(p, 3, 'Throwing the switch', () => {
      const d = sim.dinos.find((q) => q.species === 'trex');
      this.strike(f, 1);
      this.env.rift = 1;
      if (d) { const a = this.feat('summit_edge')!; d.mode = 'retreat'; d.goal = { x: a.x, y: a.y, z: a.z }; d.modeTime = 0; this.after(6, () => { if (sim.dinos.includes(d)) sim.despawn(d); }); }
      this.scarDone();
      this.line('He went over the edge, burning.', p);
    });
  }

  private scarDone() { this.set('scar_gone'); this.sim.clearHunters(); }

  private smash(p: SimPlayer) {
    const sim = this.sim;
    if (sim.count(p, 'hand_axe') + sim.count(p, 'stone_pick') < 1) { this.line('I need something heavy.', p); return; }
    sim.work(p, 4, 'Smashing the mount', () => { this.set('smashed'); this.line('Nothing will ever follow us through. Go. Go now.'); sim.sound('crash', p.x, p.y + 1, p.z, 1); });
  }

  /** One player can choose to stay. The rest go home. */
  private stay(p: SimPlayer) {
    const sim = this.sim;
    if (this.flag('staying')) return;
    this.set('staying');
    this.counters.stayer = p.id;
    this.line('I have it. Go on, go.', p);
    if (sim.alive().length === 1) this.lastOne();
  }

  private lastOne() {
    const sim = this.sim;
    if (this.ending) return;
    this.ending = 'last_one';
    this.env.rift = 0; this.env.star = 1;
    sim.bringDark();
    sim.out(null, { t: 'objective', steps: [], how: 'There is nothing left to do but look up.', title: 'Hold it open' });
    this.after(75, () => this.finish());
  }

  private enterRift(p: SimPlayer) {
    const sim = this.sim;
    if (sim.alive().some((q) => q !== p && Math.hypot(q.x - p.x, q.z - p.z) > 40 && q.id !== this.counters.stayer)) { this.line('Not without the others.', p); return; }
    if (this.flag('staying')) {
      // Whoever stayed keeps playing. Everyone else is home.
      if (this.counters.stayer === p.id) return;
      for (const q of sim.alive()) if (q.id !== this.counters.stayer) sim.out(q.id, { t: 'ending', id: 'home' });
      this.lastOne();
      return;
    }
    const record = (this.counters.photos ?? 0) >= FILM && (this.counters.caches ?? 0) >= CACHES && this.have('locket') > 0;
    this.startEpilogue(this.flag('smashed') ? 'closed' : record ? 'record' : 'home');
  }

  /** Each ending is walked, not watched. */
  private startEpilogue(id: EndingId) {
    const sim = this.sim;
    this.ending = id;
    this.env.era = 1969; this.env.rift = 0; this.env.star = 0; this.env.copper = 0; this.env.ash = 0; this.env.storm = 0;
    sim.clearAll();
    sim.travel('hollow', 'array_wake', () => {
      const f = this.feat('array')!;
      sim.time = 0.45;
      if (id === 'closed') { this.show('newspaper'); sim.time = 0.3; }
      else {
        this.npcs = [
          { id: 202, character: 2, name: 'Whitcombe', x: f.x + 9, y: f.y, z: f.z + 6, yaw: 1.4, moving: false, follow: false },
          { id: 203, character: 3, name: 'Guard', x: f.x + 13, y: f.y, z: f.z + 3, yaw: 1.2, moving: false, follow: false },
          { id: 204, character: 3, name: 'Guard', x: f.x + 13, y: f.y, z: f.z + 9, yaw: 1.6, moving: false, follow: false },
        ];
      }
      this.line(id === 'closed' ? 'Dark. Nobody here at all.' : 'Lights. Who brought lights?');
      const open = id === 'closed'
        ? { title: 'Walk out to the old camp', how: 'East, down the trail. See what is left.' }
        : { title: 'Walk toward the lights', how: 'Someone is waiting for you.' };
      sim.out(null, { t: 'objective', steps: [], ...open });
    });
  }

  private stepEpilogue() {
    if (this.ending === 'too_late' || !this.env.era) return;
  }

  finish() {
    if (this.sim.ended) return;
    this.sim.ended = true;
    this.sim.out(null, { t: 'ending', id: this.ending ?? 'home' });
  }

  // ---- who lives here -----------------------------------------------------------------------------

  /** Called on arrival and at each dawn. */
  populate() {
    const sim = this.sim, map = sim.mapId, f = this.meta.features, m = sim.mission;
    if (this.env.era) return;
    const herd = (species: SpeciesId, n: number, at: { x: number; z: number }, spread = 16, home = true) => {
      const have = sim.dinos.filter((d) => d.species === species).length;
      for (let i = have; i < n; i++) {
        const a = sim.random() * 6.28, r = sim.random() * spread, x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r;
        const d = sim.spawn(species, { x, y: sim.world.terrainAt(x, z), z }, null);
        if (home) d.home = { x: at.x, y: 0, z: at.z };
      }
    };
    if (map === 'hollow') {
      if (m >= missionIndex('find_food') && f.pachy_home) herd('pachy', 1 + (sim.partySize() > 2 ? 1 : 0), f.pachy_home, 10);
    }
    if (map === 'valley') {
      if (f.herd_a) { herd('edmontosaurus', 7, f.herd_a, 26); sim.herdInit(); }
      if (f.trike_home) herd('triceratops', 2, f.trike_home, 12);
      if (f.anky_home) herd('ankylosaurus', 1, f.anky_home, 6);
      if (f.pachy_home) herd('pachy', 2, f.pachy_home, 14);
      if (f.croc_home) { herd('croc', 2, f.croc_home, 80, false); }
      if (m >= missionIndex('search_camp')) herd('pterosaur', 1, f.nest ?? { x: 0, z: 0 }, 40, false);
    }
    if (map === 'ridge') {
      if (f.small_home) herd('thescelosaurus', 3, f.small_home, 14);
      herd('pterosaur', 1, f.nest ?? { x: 0, z: 0 }, 40, false);
    }
  }

  /** The night roster for this map. Called every few seconds. */
  private roster() {
    const sim = this.sim, map = sim.mapId, f = this.meta.features, m = sim.mission;
    const day = Math.floor(this.counters.days ?? 0);
    if (day !== this.lastDay) { this.lastDay = day; this.populate(); this.onNewDay(); }
    if (this.env.era) return;
    // Old Scar works the Bone Flats by daylight, for as long as the last shard is out there.
    if (map === 'valley' && m === missionIndex('bone_shard') && f.flats && sim.nightness() < 0.2 && !sim.dinos.some((d) => d.species === 'trex')) {
      const d = sim.spawn('trex', { x: f.flats.x, y: f.flats.y, z: f.flats.z }, null);
      d.home = { x: f.flats.x, y: 0, z: f.flats.z }; d.mode = 'rest';
    }
    if (sim.time < 0.6) return;
    const n = (s: SpeciesId) => sim.dinos.filter((d) => d.species === s).length;
    if (map !== 'hollow' && m >= missionIndex('forward_camp') && n('dakotaraptor') === 0 && sim.random() < 0.4) sim.spawnPackAt('dakotaraptor', 2, (f.nest ?? { x: 0 }).x, (f.nest ?? { z: 0 }).z, 'prowl');
    if (map !== 'hollow' && m >= missionIndex('widow_shard') && n('widow') === 0 && f.den_mouth) sim.spawnSolo('widow', f.den_mouth.x, f.den_mouth.z);
    if (n('didelphodon') === 0 && sim.alive().some((p) => p.bleeding > 25) && sim.random() < 0.5) { const p = sim.alive().find((q) => q.bleeding > 25)!; sim.spawnPackAt('didelphodon', 5, p.x + 40, p.z + 20, 'hunt'); }
    if (map === 'ridge' && this.ch3Day() >= 5 && n('trex') === 0 && m < missionIndex('through_rift')) { const p = this.lead(); const d = sim.spawn('trex', { x: p.x + 120, y: sim.world.terrainAt(p.x + 120, p.z), z: p.z }, null); d.mode = 'patrol'; }
  }

  ch3Day() { return this.counters.ch3Start === undefined ? 0 : (this.counters.days ?? 0) - this.counters.ch3Start; }

  private onNewDay() {
    const d = this.ch3Day(), sim = this.sim;
    if (this.counters.ch3Start === undefined) return;
    if (d === 2) this.clue(this.lead(), 'star_day');
    if (d >= CHAPTER3_LIMIT_DAYS && d < CHAPTER3_LIMIT_DAYS + IMPACT_GRACE_DAYS) this.line('The sky is the wrong colour now, and it is not going to change back.');
    if (d >= CHAPTER3_LIMIT_DAYS + IMPACT_GRACE_DAYS && !this.ending) {
      this.ending = 'too_late';
      this.env.star = 1; this.env.quake = 1; this.env.rift = 0;
      sim.tooLate();
      this.after(9, () => this.finish());
    }
  }

  /** The slow disasters of Chapter 3: a brighter star, a copper sky, ash, and the ground moving. */
  private stepEnv() {
    const sim = this.sim, e = this.env;
    if (!e.era && this.counters.ch3Start !== undefined && this.ending !== 'last_one' && this.ending !== 'too_late') {
      const d = this.ch3Day() + (sim.time / 1), k = Math.min(1, d / CHAPTER3_LIMIT_DAYS);
      e.star = Math.max(e.star, 0.08 + k * 0.92);
      e.copper = k * k;
      e.ash = sim.mapId === 'ridge' ? 0.15 + k * 0.85 : k * 0.4;
      if (sim.clock > this.quakeAt) {
        this.quakeAt = sim.clock + 70 + (1 - k) * 120 + sim.random() * 40;
        e.quake = 0.3 + k * 0.7;
        sim.fearAll(6);
        const p = this.lead();
        sim.sound('quake', p.x, p.y, p.z, e.quake);
        this.after(3, () => { e.quake = 0; });
      }
    } else if (this.counters.voiceAt && this.counters.ch3Start === undefined) {
      e.star = 0.06;
    }
    if (sim.mission === missionIndex('when_rift') || sim.mission >= missionIndex('test_array')) e.aurora = sim.nightness() > 0.5 ? 1 : 0;
    e.day = this.ch3Day();
    e.flood = sim.weather > 0.5 ? 1 : 0;
    const key = JSON.stringify(e);
    if (key !== this.lastEnv) { this.lastEnv = key; sim.out(null, { t: 'env', env: { ...e } }); }
  }

  private stepNpcs() {
    const sim = this.sim;
    if (this.counters.helperUntil !== undefined && sim.mission >= this.counters.helperUntil) { this.npcs = this.npcs.filter((n) => n.id !== 201); delete this.counters.helperUntil; this.line('They walked back toward the river, and would not say why.'); }
    for (const n of this.npcs) {
      if (!n.follow) continue;
      const p = this.lead(), d = Math.hypot(p.x - n.x, p.z - n.z);
      n.moving = d > 4;
      if (d > 40) { n.x = p.x + 3; n.z = p.z + 3; n.y = sim.world.terrainAt(n.x, n.z); }
      else if (n.moving) { const k = Math.min(1, (4.2 * 0.5) / d); n.x += (p.x - n.x) * k; n.z += (p.z - n.z) * k; n.yaw = Math.atan2(-(p.x - n.x), -(p.z - n.z)); n.y = sim.world.floorAt(n.x, p.y, n.z); }
    }
  }

  /** The compass and the radio are read from the hand: both point at something real. */
  private stepWidgets() {
    const sim = this.sim;
    for (const p of sim.alive()) {
      const held = p.inv[p.held]?.id, w: WidgetView = { kind: '', angle: 0, strength: 0 };
      const target = this.signalTarget();
      if (held === 'compass' && target) {
        w.kind = 'compass';
        w.angle = Math.atan2(-(target.x - p.x), -(target.z - p.z)) - p.yaw;
        if ((this.counters.shards ?? 0) >= 4 && !this.flag('shards_home')) w.angle = sim.clock * 9;
      } else if (held === 'radio' || held === 'field_radio') {
        const src = this.flag('radio_fixed') || sim.mission >= missionIndex('find_signal') ? (sim.mapId === 'ridge' ? this.feat('array') : this.feat('pass_west') ?? this.feat('pass_east')) : null;
        if (src) {
          let off = Math.abs(((Math.atan2(-(src.x - p.x), -(src.z - p.z)) - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          off = 1 - off / Math.PI;
          w.kind = 'signal'; w.strength = off * off; w.text = sim.mission >= missionIndex('climb_summit') ? 'The stones in a ring. Feed them the storm.' : sim.mission >= missionIndex('find_signal') ? 'Bring them to the ridge.' : '';
        }
      }
      const key = `${w.kind}|${w.angle.toFixed(1)}|${w.strength.toFixed(1)}|${w.text}`;
      if (key !== this.widgetKey.get(p.id)) { this.widgetKey.set(p.id, key); sim.out(p.id, { t: 'widget', widget: w }); }
    }
  }

  private signalTarget() {
    if (this.sim.mapId === 'hollow') return this.sim.takenProps.has('crystal') ? this.feat('pass_west') : this.propAt('crystal', '');
    for (const id of ['shard_swamp', 'shard_plain', 'shard_den', 'shard_flats']) if (this.shown.has(id) && !this.sim.takenProps.has(id)) return this.propAt(id, '');
    return this.feat('pass_west');
  }

  // ---- camera and recorder ------------------------------------------------------------------------

  /** Polaroid: each shot is spent whether or not it was worth it. */
  photograph(p: SimPlayer) {
    const sim = this.sim, film = this.counters.film ?? 0;
    if (film <= 0) { this.line('That was the last of the film.', p); return; }
    this.counters.film = film - 1;
    sim.sound('shutter', p.x, p.y + 1.5, p.z, 1);
    sim.noiseAt(p, p.x, p.y, p.z, 8);
    const subject = sim.subjectInView(p);
    const key = subject && `photo_${subject}`;
    if (!subject || this.flag(key!)) { this.line(subject ? 'I already have that one.' : 'A blurred picture of nothing.', p); return; }
    this.set(key!);
    this.counters.photos = (this.counters.photos ?? 0) + 1;
    sim.give(p, 'photo', 1);
    this.line(`Polaroid ${this.counters.photos}: ${subject in SPECIES ? SPECIES[subject as SpeciesId].name : subject === 'array_site' ? 'the Array' : 'the ring'}.`, p);
    if (this.counters.photos >= 3) this.side('photos');
    if (this.counters.photos >= PHOTO_SUBJECTS.length) this.side('film');
  }

  record(p: SimPlayer) {
    const sim = this.sim;
    for (const [at, clue, map] of TAPE_SPOTS) {
      if (map !== sim.mapId || sim.journal.has(clue)) continue;
      const f = this.feat(at) ?? this.propAt(at, '');
      if (!f || Math.hypot(f.x - p.x, f.z - p.z) > 24) continue;
      sim.work(p, 3, 'Recording', () => {
        this.clue(p, clue);
        this.recordings++;
        if (this.recordings >= 3) this.side('tape');
      });
      return;
    }
    this.line('Nothing here worth the tape.', p);
  }

  // ---- saved game ---------------------------------------------------------------------------------

  serial(): StorySave { return { flags: [...this.flags], counters: { ...this.counters }, stage: { ...this.stage }, open: { ...this.open }, sides: [...this.sides], shown: [...this.shown], recordings: this.recordings }; }
  restore(o: StorySave) {
    this.flags = new Set(o.flags); this.counters = { film: FILM, ...o.counters }; this.stage = o.stage; this.open = o.open; this.sides = new Set(o.sides); this.shown = new Set(o.shown); this.snareAt = {}; this.recordings = o.recordings ?? 0;
    if (this.counters.helperUntil !== undefined) delete this.counters.helperUntil;
    // Timers do not survive a save. Anything that was mid-way picks up again from its flags.
    if (this.flag('voice') && !this.counters.voiceAt) this.flags.delete('voice');
    this.flags.delete('bait_set');
    this.flags.delete('scar_fading');
    if (this.flag('test_done')) this.set('test_survived'); else this.flags.delete('test_storm');
    if (this.flag('rift_open')) this.env.rift = 1; else if (this.flag('storm_on')) this.env.storm = 1;
  }
}

/** Mission logic from the boiling of water to the rift. */
const LOGIC: Record<string, Logic> = {
  boil_water: {
    enter(s) { s.show('kill'); },
    steps(s) {
      const clay = s.have('clay'), wet = s.have('wet_pot') > 0, pot = s.have('pot') + s.have('water_pot') + s.have('boiled_water') > 0 || s.flag('drank_boiled');
      const full = s.have('water_pot') + s.have('boiled_water') > 0 || s.flag('drank_boiled'), boiled = s.have('boiled_water') > 0 || s.flag('drank_boiled');
      const open = pot || wet;
      return [
        step(count('River clay', clay, 3), clay >= 3 || open, !open ? s.nearestNode('clay', 'Clay') : null, { glint: 'clay' }),
        step('Pack: Shape a clay pot', open, null, clay >= 3 ? { craft: 'wet_pot' } : {}),
        step('Fire it in a burning fire', pot, open ? s.sim.fires.some((f) => f.lit) ? s.to('firePit', 'Your fire') : s.to('firePit', 'Build a fire') : null, wet ? { craft: 'pot' } : {}),
        step('Fill it at the river', full, pot && !full ? s.river() : null),
        step('Boil it over the fire', boiled, full && !boiled ? s.to('firePit', 'Your fire') : null, full ? { craft: 'boiled_water' } : {}),
        step('Drink it', s.flag('drank_boiled')),
      ];
    },
  },
  find_food: {
    steps(s) {
      const raw = s.have('raw_meat') + s.have('fish') > 0, cooked = s.have('cooked_meat') + s.have('cooked_fish') > 0, ate = s.flag('ate');
      const kill = s.flag('kill_taken') ? null : s.propAt('kill', 'A fresh kill');
      return [
        step('Get meat or fish', raw || cooked || ate, kill),
        step('Cook it at a fire', cooked || ate, raw ? s.to('firePit', 'Your fire') : null, raw ? { craft: s.have('raw_meat') ? 'cooked_meat' : 'cooked_fish' } : {}),
        step('Eat', ate),
      ];
    },
  },
  make_safe: {
    steps(s) {
      if (s.near('door', 12)) s.set('scout_mouth');
      if (s.near('seal', 9)) s.set('scout_tunnel');
      return [
        step('Check the main mouth', s.flag('scout_mouth'), s.to('door', 'The mouth')),
        step('Follow the flooded tunnel to its end', s.flag('scout_tunnel'), s.flag('scout_mouth') ? s.to('seal', 'Flooded tunnel') : null),
      ];
    },
  },
  door_materials: {
    steps(s) {
      const pick = s.have('stone_pick') > 0, poles = s.scale(6), rope = s.scale(4), stone = s.scale(4), clay = s.scale(3), moss = 4, branch = 6, fibre = 6;
      const c = (id: ItemId, n: number, label: string, kind: string, tag: string) => step(count(label, s.have(id), n), s.have(id) >= n, s.have(id) < n ? s.nearestNode(kind, tag) : null, { glint: kind });
      return [
        step(count('Poles (axe at a young tree)', s.have('pole'), poles), s.have('pole') >= poles),
        step(count('Rope', s.have('rope'), rope), s.have('rope') >= rope, null, s.have('fiber') >= 3 ? { craft: 'rope' } : {}),
        step('Pack: Make a stone pick', pick, null, s.have('blade') > 0 && s.have('rope') > 0 ? { craft: 'stone_pick' } : {}),
        c('stone', stone, 'Stone', 'stone', 'Stone'),
        step(count('Clay from the deep chamber', s.have('clay'), clay), s.have('clay') >= clay, pick && s.have('clay') < clay ? s.nearestNode('clay', 'Clay') : null, { glint: 'clay' }),
        c('moss', moss, 'Moss', 'moss', 'Moss'),
        c('branch', branch, 'Branches', 'branch', 'Branches'),
        c('fiber', fibre, 'Plant fibre', 'fiber', 'Fibre'),
      ];
    },
  },
  build_door: {
    steps(s) {
      const n = s.stage.door ?? 0, d = STRUCT.get('door')!, at = s.to('door', 'The mouth');
      return d.stages.map((g, i) => step(g.label, n > i, n === i ? at : null));
    },
  },
  seal_tunnel: {
    steps(s) {
      const n = s.stage.seal ?? 0, d = STRUCT.get('seal')!, at = s.to('seal', 'Flooded tunnel');
      const lines = d.stages.map((g, i) => step(g.label, s.flag('assault') || n > i, !s.flag('assault') && n === i ? at : null));
      lines.push(step('Hold until morning', s.flag('assault_over')));
      return lines;
    },
    how(s) { return s.flag('breached') ? 'They are through. Stay by the fire and keep moving.' : undefined; },
  },
  follow_marks: {
    enter(s) { s.show('arrows', 'arrow_1', 'arrow_2', 'arrow_3', 'arrow_4', 'arrow_5'); },
    steps(s) {
      const map = s.sim.mapId, read = s.sim.journal.has('marks');
      if (map === 'hollow') return [step('Look at what the ferns were hiding', read, s.propAt('arrows', 'The rock')), step('Follow the arrows west', false, read ? s.to('pass_west', 'The pass') : null)];
      s.show('arrow_v1', 'arrow_v2', 'arrow_v3');
      return [step('Look at what the ferns were hiding', true), step('Follow the arrows west', s.near('river_east', 30), s.to('river_east', 'The river'))];
    },
  },
  cross_river: {
    enter(s) { s.show('arrow_v4', 'arrow_v5', 'arrow_v6'); },
    steps(s) {
      const n = s.stage.raft ?? 0, d = STRUCT.get('raft')!, at = s.to('raft_site', 'River bank');
      return [
        ...d.stages.map((g, i) => step(g.label, n > i, n === i ? at : null, i === 2 && s.sim.players.size === 1 && s.have('lever') === 0 ? { craft: 'lever' } : {})),
        step('Pole across', s.flag('crossed'), n >= 3 ? at : null),
      ];
    },
  },
  end_of_marks: {
    enter(s) { s.show('arrow_v7', 'arrow_v8'); },
    steps(s) { const ok = s.near('camp1938', 26); if (ok) s.clue(s.sim.alive()[0], 'camp1938'); return [step('Stay with the arrows', ok, s.to('camp1938', 'Arrows'))]; },
  },
  search_camp: {
    steps(s) {
      const j = s.sim.journal;
      return [
        step('The typed roster', j.has('roster'), s.propAt('roster', 'Roster')),
        step('The grave markers', j.has('graves'), s.propAt('grave_1', 'Graves')),
        step('The rifle rack', j.has('rifles'), s.propAt('rifle_rack', 'Rifles')),
        step('The radio', j.has('field_radio'), s.propAt('field_radio', 'Radio')),
      ];
    },
  },
  recover_pages: {
    enter(s) { s.show(...Array.from({ length: PAGES }, (_, i) => `page_${i + 1}`)); },
    steps(s) {
      let next: Step['at'] | null = null;
      for (let i = 1; i <= PAGES && !next; i++) next = s.propAt(`page_${i}`, 'Page');
      return [step(count('Pages', s.counters.pages ?? 0, PAGES), (s.counters.pages ?? 0) >= PAGES, next)];
    },
  },
  repair_radio: { steps(s) { return [step('Move the batteries into the radio', s.flag('radio_fixed'), s.to('radio_bench', 'Workbench'))]; } },
  first_shard: {
    enter(s) { s.show('shard_swamp'); },
    steps(s) { return [step('Follow the needle into the swamp', s.sim.takenProps.has('shard_swamp'), s.propAt('shard_swamp', 'Needle'))]; },
    how(s) { return s.have('compass') > 0 ? 'Hold the compass. The needle twitches toward them.' : 'Whoever has the compass should lead. Otherwise, trust the map in your head.'; },
  },
  forward_camp: {
    steps(s) {
      return [
        step('Pack: Cut sharpened stakes', s.have('stake') >= 6 || s.built('fwd_barricade'), null, s.have('pole') > 0 ? { craft: 'stake' } : {}),
        step('Fire ring', s.built('fwd_ring'), !s.built('fwd_ring') ? s.to('fwd_ring', 'Camp site') : null),
        step('Stake barricade', s.built('fwd_barricade'), !s.built('fwd_barricade') ? s.to('fwd_barricade', 'Camp site') : null),
        step('Hidden sleeping hollow', s.built('fwd_hollow'), !s.built('fwd_hollow') ? s.to('fwd_hollow', 'Camp site') : null),
      ];
    },
  },
  plain_shard: {
    enter(s) { s.show('shard_plain'); },
    steps(s) { return [step('Find it in the herds\' path', s.sim.takenProps.has('shard_plain'), s.propAt('shard_plain', 'Needle'))]; },
  },
  find_calloway: {
    enter(s) { if (s.sim.players.size === 1) { s.show('swamp_cry'); s.line2('Far off in the swamp, somebody is calling for help.'); } if (s.sim.journal.has('page_6')) s.set('high_ground'); },
    steps(s) { return [step('Find a way up', s.near('ladder', 14), s.to('ladder', 'Rope ladder')), step('Climb', s.flag('climbed'))]; },
  },
  explore_treehouse: {
    steps(s) {
      const j = s.sim.journal;
      return [
        step('The tally marks', j.has('tally'), s.propAt('tally', 'Tallies')),
        step('The traps', j.has('traps'), s.propAt('traps', 'Snares')),
        step('The drawings of lights', j.has('green_lights'), s.propAt('green_lights', 'Drawings')),
        step('Her map', j.has('calloway_map'), s.propAt('calloway_map', 'Map')),
      ];
    },
  },
  read_knife_page: { steps(s) { return [step('Read it', s.sim.journal.has('knife_page'), s.propAt('knife_page', 'A knife'))]; } },
  widow_shard: {
    enter(s) { s.show('shard_den'); },
    steps(s) { return [step('Take the shard from the den', s.sim.takenProps.has('shard_den'), s.propAt('shard_den', "The Widow's den"))]; },
    how(s) { return s.sim.takenProps.has('shard_den') ? undefined : s.sim.nightness() > 0.5 ? 'She is out. Go now, and do not stay.' : 'She is at home by day. Wait for dark.'; },
  },
  bone_shard: {
    enter(s) { s.show('shard_flats'); },
    steps(s) { return [step('Take the shard from the Bone Flats', s.sim.takenProps.has('shard_flats'), s.propAt('shard_flats', 'Bone Flats'))]; },
    how(s) { return s.sim.nightness() > 0.3 ? 'Too dark to search the flats. Wait for daylight.' : undefined; },
  },
  bring_home: {
    enter(s) { s.line2('Near each other they glow. The compass will not stop.'); },
    steps(s) {
      const home = s.sim.mapId === 'hollow';
      return [
        step('Carry them east', home, !home ? s.to('pass_east', 'The way back') : null),
        step('Set them down behind the door', s.flag('shards_home'), home ? s.to('shard_cache', 'The cave') : null),
      ];
    },
  },
  find_signal: {
    steps(s) {
      const map = s.sim.mapId;
      return [
        step('Listen to the radio', s.flag('voice') && (s.counters.voiceAt ?? 0) > 0),
        step('Take the shards', s.flag('shards_taken'), map === 'hollow' && !s.flag('shards_taken') ? s.to('shard_cache', 'The shards') : null),
        step('Go west, past the valley', false, s.flag('shards_taken') ? (map === 'hollow' ? s.to('pass_west', 'The pass') : s.to('pass_west', 'West pass')) : null),
      ];
    },
  },
  follow_signal: { steps(s) { return [step('Walk toward the voice', s.near('ash_edge', 26), s.to('ash_edge', 'Signal'))]; } },
  cross_ash: {
    steps(s) {
      return [
        step('Pack: Split bone pitons (bone from the ash)', s.have('piton') >= 4 || s.flag('pitoned'), s.have('bone') < 2 && !s.flag('pitoned') ? s.nearestNode('bone', 'Old bone') : null, { craft: 'piton', glint: 'bone' }),
        step('Climb the scarp', s.near('scarp_top', 30), s.to('scarp', 'The scarp')),
      ];
    },
  },
  hot_springs: {
    steps(s) { return [step('Reach the springs', s.near('hot_ring', 26), s.to('hot_ring', 'Warm air')), step('Fire ring on the ledge', s.built('hot_ring'), s.to('hot_ring', 'The ledge'))]; },
  },
  climb_summit: { steps(s) { return [step('Keep climbing', s.near('summit_low', 24), s.to('summit_low', 'Signal'))]; } },
  find_source: {
    enter(s) { s.line2('RADIO: "...wire the stones in a ring, and feed them the storm..."'); },
    steps(s) {
      const j = s.sim.journal;
      return [step('The ring of stones', j.has('ring'), s.propAt('ring_stones', 'Ring')), step('The coil', j.has('coil'), s.propAt('coil', 'Coil')), step('The scorched rock', j.has('scorch'), s.propAt('scorch', 'Scorch'))];
    },
  },
  when_rift: {
    steps(s) {
      const j = s.sim.journal;
      return [step("Whitcombe's notes", j.has('wnotes'), s.propAt('wnotes', 'Notes')), step('Watch the sky after dark', j.has('aurora'), j.has('wnotes') ? s.to('summit_watch', 'The summit') : null)];
    },
  },
  find_copper: {
    enter(s) { s.set('nest_woken'); s.sim.spawnPackAt('pectinodon', 3 + s.sim.partySize(), s.feat('tube_copper')?.x ?? 0, s.feat('tube_copper')?.z ?? 0, 'nest'); },
    steps(s) {
      const need = s.scale(10), n = s.have('copper_ore');
      return [step(count('Native copper', n, need), n >= need, n < need ? s.nearestNode('copper', 'Copper') : null, { glint: 'copper' })];
    },
    how(s) { return s.sim.alive().some((p) => p.character === 0) ? 'Varga can read it: green stain on the tube walls. It takes a pick.' : undefined; },
  },
  smelt: {
    steps(s) {
      const need = s.scale(5), have = s.have('copper');
      return [
        step('Clay furnace', s.built('furnace'), !s.built('furnace') ? s.to('furnace', 'Furnace site') : null),
        step(count('Copper ingots', have, need), have >= need, s.built('furnace') ? s.to('furnace', 'Furnace') : null, s.built('furnace') ? { craft: 'copper' } : {}),
      ];
    },
  },
  make_wire: {
    steps(s) {
      const need = 8;
      return [
        step('Pack: Drill a bored stone', s.have('bored_stone') > 0, null, { craft: 'bored_stone' }),
        step(count('Copper wire', s.have('wire'), need), s.have('wire') >= need, null, s.have('bored_stone') > 0 ? { craft: 'wire' } : {}),
      ];
    },
  },
  raise_mast: {
    steps(s) {
      return [
        step('Fell the tallest dead tree', s.flag('tree_down'), !s.flag('tree_down') ? s.to('dead_tree', 'Dead tree') : null),
        step('Haul it to the summit', s.built('mast'), s.flag('tree_down') ? s.to('mast', 'Mast step') : null, s.sim.players.size === 1 && s.have('lever') === 0 ? { craft: 'lever' } : {}),
      ];
    },
  },
  wire_array: {
    steps(s) { const n = s.stage.array_ring ?? 0, d = STRUCT.get('array_ring')!; return d.stages.map((g, i) => step(g.label, n > i, n === i ? s.to('array', 'The ring') : null)); },
    how(s) { return s.sim.alive().some((p) => p.character === 1) ? undefined : 'Without Okafor this goes slowly, from her notes. Stay on it.'; },
  },
  test_array: {
    steps(s) {
      return [
        step('Wait for the storm', s.env.storm > 0 || s.flag('test_done')),
        step('Close the switch', s.flag('test_done'), s.env.storm > 0 && !s.flag('test_done') ? s.to('switch', 'The switch') : null),
        step('Survive what comes up the ridge', s.flag('test_survived')),
      ];
    },
  },
  ground_array: {
    steps(s) {
      return [
        step('Pack: Hammer a copper spike', s.have('copper_spike') > 0 || s.built('ground'), null, { craft: 'copper_spike' }),
        step('Drive it into the springs', s.built('ground'), s.to('ground', 'Hot springs')),
      ];
    },
  },
  fortify: {
    steps(s) {
      return [
        step('Barricades', s.built('barricade_1') && s.built('barricade_2') && s.built('barricade_3'), s.to(['barricade_1', 'barricade_2', 'barricade_3'].find((b) => !s.built(b)) ?? 'switch', 'Barricade')),
        step('Summit fire ring', s.built('summit_ring'), !s.built('summit_ring') ? s.to('summit_ring', 'Fire ring') : null),
        step('Snare lines', s.built('trap_1') && s.built('trap_2'), s.to(!s.built('trap_1') ? 'trap_1' : 'trap_2', 'Snare'), s.have('snare') < 1 ? { craft: 'snare' } : {}),
      ];
    },
  },
  hold_storm: {
    steps(s) {
      const n = s.counters.strikes ?? 0;
      return [
        step('Call the storm', s.flag('storm_on'), !s.flag('storm_on') ? s.to('switch', 'The switch') : null),
        step(`Strikes in a row ${Math.min(n, 3)} of 3`, s.flag('rift_open'), s.flag('storm_on') ? s.brokenTarget() : null),
      ];
    },
  },
  through_rift: {
    enter(s) { s.spawnScar(); },
    steps(s) {
      return [
        step('Get Old Scar off the summit', s.flag('scar_gone'), !s.flag('scar_gone') ? s.to('tube_prop', 'Lava tube') : null),
        step('Reach the rift', false, s.flag('scar_gone') ? s.to('rift', 'The rift') : null),
      ];
    },
  },
};

export { CLUES, SUNSET_SECONDS };
