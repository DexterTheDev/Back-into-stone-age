import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { GameSim, type SimPlayer } from '../src/sim/GameSim.ts';
import { loadWorldFromDisk } from '../src/sim/load-node.ts';
import { Btn, PLAYER } from '../src/sim/movement.ts';
import { NIGHTFALL, NIGHT_SECONDS, PHASE, START_TIME, SUNSET_SECONDS } from '../src/sim/time.ts';
import { decodeSnapshot, encodeSnapshot, type ServerEvent } from '../src/net/protocol.ts';
import type { SimWorld, NavPoint } from '../src/sim/world.ts';
import { Anim } from '../src/data/species.ts';

const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/public/assets');
let world: SimWorld;
beforeAll(async () => { world = await loadWorldFromDisk(assets); }, 60000);

function newSim() {
  const events: ServerEvent[] = [];
  const sim = new GameSim(world, (_p, e) => events.push(e), 1234);
  const p = sim.addPlayer(1, 'test', 0);
  return { sim, p, events };
}

/** Walks a player along nav waypoints through the real collision world. */
function walk(sim: GameSim, p: SimPlayer, goal: NavPoint, maxTicks: number, seq = { n: 1 }, sprint = false) {
  let route = world.nav!.path({ x: p.x, y: p.y, z: p.z }, goal);
  let wp = 0, stuck = 0, lx = p.x, lz = p.z, dodge = 0, side = Btn.Left;
  for (let t = 0; t < maxTicks; t++) {
    const next = route[Math.min(wp, route.length - 1)] ?? goal;
    if (Math.hypot(next.x - p.x, next.z - p.z) < 1.2) { wp++; if (wp >= route.length) return true; }
    const yaw = Math.atan2(-(next.x - p.x), -(next.z - p.z));
    // Stalagmites are below nav-mesh resolution: step around them as a person would.
    const buttons = dodge > 0 ? side | Btn.Forward : Btn.Forward | (sprint ? Btn.Sprint : 0);
    if (dodge > 0) dodge--;
    sim.handle(p.id, { t: 'input', seq: seq.n++, buttons, yaw, pitch: 0 });
    sim.step();
    if (t % 45 === 44) {
      if (Math.hypot(p.x - lx, p.z - lz) < 0.3) { stuck++; dodge = 30 + stuck * 12; side = stuck % 2 ? Btn.Left : Btn.Right; route = world.nav!.path({ x: p.x, y: p.y, z: p.z }, goal); wp = 1; } else if (dodge === 0) stuck = 0;
      lx = p.x; lz = p.z;
      if (stuck > 8) return false;
    }
  }
  return false;
}

describe('protocol', () => {
  it('round-trips a snapshot', () => {
    const { sim, p } = newSim();
    sim.handle(p.id, { t: 'input', seq: 1, buttons: 0, yaw: 1, pitch: 0.2 });
    sim.spawn('raptor', { x: 5, y: 60, z: -7 }, null);
    const a = sim.snapshotFor(p.id)!;
    a.dinos = [{ id: 3, species: 1, x: 12.5, y: 60.25, z: -7.75, yaw: 2, anim: Anim.Run, speed: 6.5, flags: 1 }];
    a.fires = [{ id: 1, fuel: 0.5, lit: true }];
    const b = decodeSnapshot(encodeSnapshot(a));
    expect(b.tick).toBe(a.tick);
    expect(b.self.ack).toBe(a.self.ack);
    expect(b.self.x).toBeCloseTo(a.self.x, 2);
    expect(b.players[0].yaw).toBeCloseTo(1, 2);
    expect(b.dinos[0].x).toBeCloseTo(12.5, 1);
    expect(b.dinos[0].anim).toBe(Anim.Run);
    expect(b.fires[0].lit).toBe(true);
    expect(encodeSnapshot(a).byteLength).toBeLessThan(160);
  });
});

describe('physics', () => {
  it('every spawn rests on the cave floor', () => {
    for (let i = 0; i < 4; i++) {
      const sim = new GameSim(world, () => {}, 1);
      const s = world.blobs.meta.spawns[i];
      for (let k = 0; k < i; k++) sim.addPlayer(k + 10, 'x', 0);
      const p = sim.addPlayer(1, 't', 0);
      for (let t = 0; t < 60; t++) { sim.handle(1, { t: 'input', seq: t + 1, buttons: 0, yaw: 0, pitch: 0 }); sim.step(); }
      expect(p.grounded, `spawn ${i} grounded`).toBe(true);
      expect(Math.abs(p.y - s.y), `spawn ${i} height`).toBeLessThan(1.2);
    }
  });

  it('a player can walk from the array chamber out of the cave to the river', () => {
    const { sim, p } = newSim();
    const m = world.blobs.meta;
    const seq = { n: 1 };
    expect(walk(sim, p, { x: m.mouth.x + 6, y: m.mouth.y, z: m.mouth.z }, 30 * 180, seq)).toBe(true);
    expect(p.x).toBeGreaterThan(m.mouth.x);
    expect(walk(sim, p, m.features.campSite, 30 * 180, seq)).toBe(true);
    expect(Math.hypot(p.x - m.features.campSite.x, p.z - m.features.campSite.z)).toBeLessThan(6);
  }, 60000);

  it('a player can reach the deep chamber and climb back out', () => {
    const { sim, p } = newSim();
    const deep = world.blobs.meta.chambers.find((c) => c.name === 'deep')!;
    const arr = world.blobs.meta.chambers.find((c) => c.name === 'array')!;
    const seq = { n: 1 };
    expect(walk(sim, p, { x: deep.x + 2, y: deep.y - 4, z: deep.z }, 30 * 120, seq)).toBe(true);
    expect(walk(sim, p, { x: arr.x, y: arr.y - 3, z: arr.z }, 30 * 120, seq)).toBe(true);
  }, 60000);

  it('stays inside the map bound', () => {
    const { sim, p } = newSim();
    Object.assign(p, { x: PLAYER.bound + 20, y: 400, z: 0 });
    for (let t = 0; t < 30; t++) { sim.handle(1, { t: 'input', seq: t + 1, buttons: 0, yaw: 0, pitch: 0 }); sim.step(); }
    expect(p.x).toBeLessThanOrEqual(PLAYER.bound);
  });
});

describe('story', () => {
  it('runs the opening chain from flashlight to hand axe', () => {
    const { sim, p } = newSim();
    const m = world.blobs.meta;
    const go = (x: number, y: number, z: number) => Object.assign(p, { x, y, z });
    const f = m.props.find((q) => q.id === 'flashlight')!;
    go(f.x, f.y + 0.2, f.z);
    sim.handle(1, { t: 'interact', prop: 'flashlight' });
    expect(sim.mission).toBe(1);
    expect(p.lightOn).toBe(true);
    const d = m.props.find((q) => q.id === 'dragmarks')!;
    go(d.x, d.y + 0.2, d.z);
    sim.handle(1, { t: 'interact', prop: 'dragmarks' });
    expect(sim.mission).toBe(2);
    go(m.mouth.x + 20, m.mouth.y, m.mouth.z);
    sim.step();
    expect(sim.mission).toBe(3);
    const fp = m.props.find((q) => q.id === 'footprint')!;
    go(fp.x, fp.y + 0.2, fp.z);
    sim.handle(1, { t: 'interact', prop: 'footprint' });
    expect(sim.mission).toBe(4);
    expect(sim.dinos.some((x) => x.species === 'trex')).toBe(true);
    const node = m.nodes.find((n) => n.kind === 'flint' && sim.liveNodes.has(n.id) && n.x > 100)!;
    go(node.x, node.y + 0.2, node.z);
    sim.handle(1, { t: 'interact', node: node.id });
    for (let t = 0; t < 60; t++) sim.step();
    expect(sim.count(p, 'flint')).toBe(1);
    expect(sim.mission).toBe(5);
    sim.handle(1, { t: 'knap', hits: 5, good: 4 });
    expect(sim.count(p, 'blade')).toBe(1);
    expect(sim.mission).toBe(6);
    sim.give(p, 'branch', 1); sim.give(p, 'fiber', 2);
    sim.handle(1, { t: 'craft', id: 'hand_axe' });
    for (let t = 0; t < 30 * 8; t++) sim.step();
    expect(sim.count(p, 'hand_axe')).toBe(1);
    expect(sim.mission).toBe(7);
  });
});

describe('the first night', () => {
  it('runs from the fire through dawn to the first drink', () => {
    const { sim, p } = newSim();
    const m = world.blobs.meta;
    sim.mission = 7;
    const f = m.features.firePit;
    Object.assign(p, { x: f.x, y: f.y + 0.3, z: f.z });
    sim.give(p, 'tinder', 2); sim.give(p, 'branch', 3); sim.give(p, 'bow_drill', 1);
    sim.handle(1, { t: 'place_fire' });
    for (let t = 0; t < 30 * 6; t++) sim.step();
    sim.handle(1, { t: 'ignite', fire: sim.fires[0].id });
    for (let t = 0; t < 30 * 10; t++) sim.step();
    expect(sim.fires[0].lit, 'the fire caught').toBe(true);
    expect(sim.mission, 'no talk of morning while the sun is up').toBe(7);
    for (let t = 0; t < 30 * (SUNSET_SECONDS + 3); t++) sim.step();
    expect(sim.mission, 'dark brings the night objective').toBe(8);
    // Skip to just before dawn. The hunters must leave with the light.
    sim.time = 0.999;
    sim.clock = 300;
    sim.spawn('raptor', { x: f.x + 30, y: f.y, z: f.z }, null);
    for (let t = 0; t < 30 * 8; t++) sim.step();
    expect(sim.mission, 'dawn ends the night').toBe(9);
    const r = m.river[140];
    Object.assign(p, { x: r.x + r.w + 1.5, y: 80, z: r.z });
    for (let t = 0; t < 40; t++) { sim.handle(1, { t: 'input', seq: 5000 + t, buttons: 0, yaw: 0, pitch: 0 }); sim.step(); }
    sim.handle(1, { t: 'drink' });
    for (let t = 0; t < 30 * 4; t++) sim.step();
    expect(sim.mission, 'the river leads to the pot').toBe(10);
    expect(p.fever, 'and the water makes them sick').toBeGreaterThan(0);
  });
});

describe('the day clock', () => {
  const run = (sim: GameSim, seconds: number) => { for (let t = 0; t < 30 * seconds; t++) sim.step(); };
  const lit = (sim: GameSim) => sim.fires.push({ id: 1, x: 0, y: 0, z: 0, fuel: 1, lit: true });

  it('a fire lit in broad daylight brings the dark within a minute', () => {
    const { sim, events } = newSim();
    sim.mission = 7;
    lit(sim);
    run(sim, 1);
    expect(events.some((e) => e.t === 'line' && e.text.includes('sun')), 'the player is told').toBe(true);
    let last = sim.time, seconds = 0;
    while (sim.mission === 7 && seconds < 90) {
      run(sim, 1);
      seconds++;
      expect(sim.time, 'the sun only goes one way').toBeGreaterThan(last);
      last = sim.time;
    }
    expect(sim.mission).toBe(8);
    expect(sim.time).toBeGreaterThanOrEqual(NIGHTFALL);
    expect(seconds, 'sunset length').toBeLessThanOrEqual(SUNSET_SECONDS + 3);
    expect(events.filter((e) => e.t === 'mission').length, 'one announcement').toBe(1);
  });

  it('a fire lit at dusk does not slow the dark down', () => {
    const { sim } = newSim();
    sim.mission = 7;
    sim.time = NIGHTFALL - 0.001;
    lit(sim);
    run(sim, 3);
    expect(sim.mission).toBe(8);
  });

  it('a fire already burning counts when the mission reaches it', () => {
    const { sim } = newSim();
    sim.mission = 6;
    lit(sim);
    run(sim, 5);
    expect(sim.mission).toBe(6);
    expect(sim.time, 'the clock ignores it until then').toBeLessThan(START_TIME + 0.01);
    sim.mission = 7;
    run(sim, SUNSET_SECONDS + 3);
    expect(sim.mission).toBe(8);
  });

  it('dusk to sunrise takes the set number of minutes', () => {
    const { sim } = newSim();
    sim.mission = 8;
    sim.clock = 300;
    sim.time = PHASE.dayEnd;
    let seconds = 0;
    while (sim.mission === 8 && seconds < 1500) { run(sim, 1); seconds++; }
    expect(sim.mission).toBe(9);
    expect(Math.abs(seconds - NIGHT_SECONDS), 'night length').toBeLessThanOrEqual(2);
  });

  it('a slow player keeps the afternoon, and dusk still comes', () => {
    const late = newSim(), onTime = newSim();
    late.sim.mission = 4; onTime.sim.mission = 7;
    late.sim.time = onTime.sim.time = 0.42;
    run(late.sim, 60); run(onTime.sim, 60);
    const gained = (x: GameSim) => x.time - 0.42;
    expect(gained(late.sim)).toBeCloseTo(gained(onTime.sim) / 4, 4);
    let seconds = 0;
    while (late.sim.mission === 4 && seconds < 1500) { run(late.sim, 5); seconds += 5; }
    expect(late.sim.mission, 'the objective forces the night eventually').toBe(8);
  });
});

describe('character specialties', () => {
  it('Okafor crafts faster and Reyes moves quieter', () => {
    const sim = new GameSim(world, () => {}, 9);
    const o = sim.addPlayer(1, 'Okafor', 1);
    sim.give(o, 'fiber', 3);
    sim.handle(1, { t: 'craft', id: 'rope' });
    for (let t = 0; t < 30 * 3; t++) sim.step();
    expect(sim.count(o, 'rope'), 'done in 2.8 s, not 4').toBe(1);
  });
});

describe('fall recovery', () => {
  it('returns a player who somehow ends up below the world', () => {
    const { sim, p } = newSim();
    Object.assign(p, { x: 200, y: 2, z: 130 });
    sim.handle(1, { t: 'input', seq: 9, buttons: 0, yaw: 0, pitch: 0 });
    expect(p.y).toBeGreaterThan(20);
  });
});

describe('creatures', () => {
  it('a raptor pack rings a fire, then closes when it dies', () => {
    const { sim, p, events } = newSim();
    const m = world.blobs.meta;
    sim.time = 0.66; // night
    const fx = m.features.firePit;
    Object.assign(p, { x: fx.x, y: fx.y + 0.3, z: fx.z, inv: p.inv });
    sim.give(p, 'tinder', 2); sim.give(p, 'branch', 3); sim.give(p, 'bow_drill', 1);
    sim.handle(1, { t: 'place_fire' });
    for (let t = 0; t < 30 * 6; t++) sim.step();
    expect(sim.fires.length).toBe(1);
    sim.handle(1, { t: 'ignite', fire: sim.fires[0].id });
    for (let t = 0; t < 30 * 10; t++) sim.step();
    expect(sim.fires[0].lit).toBe(true);
    sim.fires[0].fuel = 1;
    // Director brings a pack in from out of sight. Let them arrive.
    let closest = 1e9;
    for (let t = 0; t < 30 * 90; t++) {
      sim.handle(1, { t: 'input', seq: 100000 + t, buttons: 0, yaw: 0, pitch: 0 });
      sim.step();
      sim.fires[0].fuel = 1;
      for (const d of sim.dinos) closest = Math.min(closest, Math.hypot(d.x - p.x, d.z - p.z));
    }
    expect(sim.packs.length).toBeGreaterThan(0);
    expect(closest, 'pack arrives').toBeLessThan(40);
    // Put the fire out: they must come in.
    sim.fires[0].fuel = 0; sim.fires[0].lit = false;
    let died = false;
    for (let t = 0; t < 30 * 90 && !died; t++) {
      sim.handle(1, { t: 'input', seq: 200000 + t, buttons: 0, yaw: 0, pitch: 0 });
      sim.step();
      died = events.some((e) => e.t === 'death');
    }
    expect(died, 'player is killed once the fire is out').toBe(true);
  }, 120000);

  it('crouch-walking is not heard, axe work is', () => {
    const { sim, p } = newSim();
    const m = world.blobs.meta;
    const c = m.features.campSite;
    Object.assign(p, { x: c.x, y: c.y + 0.5, z: c.z });
    const d = sim.spawn('raptor', { x: c.x + 15, y: c.y, z: c.z }, null);
    d.mode = 'rest';
    for (let t = 0; t < 60; t++) { sim.handle(1, { t: 'input', seq: t + 1, buttons: Btn.Forward | Btn.Crouch, yaw: 0, pitch: 0 }); sim.step(); }
    expect(d.alert, 'crouching stays silent').toBe(0);
    (sim as unknown as { noise(p: unknown, x: number, y: number, z: number, r: number): void }).noise(p, p.x, p.y, p.z, 40);
    expect(d.alert).toBeGreaterThan(0);
  });
});
