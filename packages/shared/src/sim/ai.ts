/**
 * Dinosaur brains. Each animal scores its options once a second (utility), then runs the
 * winner as a small state behaviour. Packs share a blackboard. Time of day changes the
 * scores, which is what swaps the rosters at dawn and dusk.
 */
import { Anim, SPECIES, type Role, type SpeciesId } from '../data/species.ts';
import type { GameSim, SimPlayer } from './GameSim.ts';
import type { NavPoint } from './world.ts';

export type Mode = 'rest' | 'patrol' | 'alert' | 'investigate' | 'stalk' | 'circle' | 'charge' | 'bite' | 'retreat' | 'flee' | 'scripted' | 'dead' | 'flinch' | 'warn' | 'swoop';

export interface Pack {
  id: number;
  members: Dino[];
  target: number | null;
  /** Last known position of prey, shared by everyone. */
  known: NavPoint | null;
  knownAt: number;
  /** Next time someone is allowed to test the fire. */
  nextProbe: number;
  /** Spots that hid a player once. Raptors check them next time. */
  memory: NavPoint[];
  home: NavPoint;
  hurtUntil: number;
}

export interface Dino {
  id: number; species: SpeciesId; speciesIndex: number;
  x: number; y: number; z: number; yaw: number; speed: number;
  anim: Anim; health: number;
  mode: Mode; modeTime: number; pack: Pack | null;
  goal: NavPoint | null; path: NavPoint[]; pathAt: number; thinkAt: number;
  alert: number; lastHeard: NavPoint | null; lastHeardAt: number; hits: number;
  biteAt: number; angle: number; radius: number; flags: number; despawnAt: number | null; blocked: number;
  /** Where a territorial animal or a grazer belongs. */
  home: { x: number; y: number; z: number } | null;
  /** Clock time of its last warning display. */
  warned: number;
  script?: { points: NavPoint[]; i: number; roared: boolean; speed: number };
}

const angDiff = (a: number, b: number) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const dist2 = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const dist3 = (a: NavPoint, b: NavPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export const FIRE_FEAR_RADIUS = 7.5;

export function setMode(d: Dino, mode: Mode, sim: GameSim) {
  if (d.mode === mode) return;
  d.mode = mode; d.modeTime = 0; d.path = []; d.pathAt = 0;
  void sim;
}

function moveToward(sim: GameSim, d: Dino, goal: NavPoint, speed: number, dt: number) {
  const sp = SPECIES[d.species];
  const nav = sim.world.nav;
  const now = sim.clock;
  if (sp.caves && nav) {
    if (now > d.pathAt || d.path.length === 0) {
      d.path = nav.path(d, goal);
      d.pathAt = now + 0.8 + (d.id % 5) * 0.08;
      if (d.path.length > 1) d.path.shift();
    }
  } else d.path = [goal];
  const next = d.path[0] ?? goal;
  if (dist2(d, next) < 0.9 && d.path.length > 1) d.path.shift();
  const want = Math.atan2(-(next.x - d.x), -(next.z - d.z));
  const diff = angDiff(d.yaw, want);
  const maxTurn = sp.turn * dt;
  d.yaw += Math.max(-maxTurn, Math.min(maxTurn, diff));
  // Slow into sharp turns, as heavy animals must.
  const align = Math.max(0.15, 1 - Math.abs(diff) / 1.6);
  d.speed = speed * align;
  const ox = d.x, oz = d.z;
  d.x -= Math.sin(d.yaw) * d.speed * dt;
  d.z -= Math.cos(d.yaw) * d.speed * dt;
  separate(sim, d);
  // The door and the tunnel seal are not in the nav mesh: an animal just comes up against them.
  if (sim.story.walled(d.x, d.z)) { d.x = ox; d.z = oz; d.speed = 0; }
  settle(sim, d);
  // Nav waypoints know nothing of boulders. One can sit inside a rock, pinning the animal against it.
  if (Math.hypot(d.x - ox, d.z - oz) < d.speed * dt * 0.3) {
    d.blocked += dt;
    if (d.blocked > 0.4) { d.blocked = 0; if (d.path.length > 1) d.path.shift(); d.pathAt = now + 1.6; d.yaw += 0.6; }
  } else d.blocked = 0;
  d.anim = d.speed > sp.walk * 1.5 ? Anim.Run : d.speed > 0.1 ? Anim.Walk : Anim.Idle;
}

function separate(sim: GameSim, d: Dino) {
  const buf: number[] = [];
  const n = sim.world.grid.query(d.x, d.z, 3, buf);
  for (let i = 0; i < n; i += 4) {
    if (Math.abs(buf[i + 3] - d.y) > 6) continue;
    const rr = buf[i + 2] + d.radius, dx = d.x - buf[i], dz = d.z - buf[i + 1], d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-4) {
      const l = Math.sqrt(d2), k = (rr - l) / l;
      d.x += dx * k; d.z += dz * k;
      // Slide around the obstacle: radial push alone pins an animal heading straight at it.
      const nx = dx / l, nz = dz / l, fx = -Math.sin(d.yaw), fz = -Math.cos(d.yaw);
      const side = -nz * fx + nx * fz >= 0 ? 1 : -1;
      const step = Math.max(d.speed, 1) * 0.05;
      d.x += -nz * side * step; d.z += nx * side * step;
    }
  }
  if (d.pack) for (const o of d.pack.members) {
    if (o === d || o.mode === 'dead') continue;
    const dx = d.x - o.x, dz = d.z - o.z, l = Math.hypot(dx, dz), rr = (d.radius + o.radius) * 1.6;
    if (l < rr && l > 1e-3) { const k = ((rr - l) / l) * 0.5; d.x += dx * k; d.z += dz * k; }
  }
}

function settle(sim: GameSim, d: Dino) {
  const y = sim.world.floorAt(d.x, d.y + 1, d.z);
  d.y += (y - d.y) * 0.5;
}

/** What this animal can perceive about a player, as a 0..1 chance per second. */
function sightOf(sim: GameSim, d: Dino, p: SimPlayer) {
  const sp = SPECIES[d.species];
  const dist = Math.hypot(d.x - p.x, d.z - p.z);
  if (dist > sp.sight) return 0;
  // Nothing hides from a nose at arm's length, unless it is crouched behind cover.
  if (dist < 5 && !(p.crouched && dist > 2.5)) return 1;
  const dirTo = Math.atan2(-(p.x - d.x), -(p.z - d.z));
  if (Math.abs(angDiff(d.yaw, dirTo)) > sp.fov / 2 && dist > 4) return 0;
  const ambient = sim.ambientLight(p);
  let vis = 0.12 + ambient * 0.88;
  if (p.lightOn || p.torch) vis = Math.max(vis, 1);
  if (p.nearFire) vis = Math.max(vis, 0.8);
  vis *= p.crouched ? 0.45 : 1;
  if (p.moving) vis *= p.sprinting ? 1.5 : 1.15; else vis *= 0.7;
  vis *= sim.coverAt(p);
  const range = sp.sight * Math.min(1, vis);
  if (dist > range) return 0;
  if (!sim.world.collision.clearLine(d.x, d.y + 1.2, d.z, p.x, p.y + 1, p.z)) return 0;
  return Math.min(1, vis * (1.4 - dist / sp.sight));
}

/** Loud noises only. One noise makes it look; repeats or a very loud one bring it over. */
export function hearNoise(sim: GameSim, d: Dino, x: number, y: number, z: number, range: number) {
  const sp = SPECIES[d.species];
  const hunting = d.mode === 'stalk' || d.mode === 'circle' || d.mode === 'charge';
  const reach = range * (hunting ? sp.hearingHunt : 1) * sim.noiseMult(x, z);
  const dist = Math.hypot(d.x - x, d.y - y, d.z - z);
  if (dist > reach) return;
  // Solid rock muffles; open passages carry. A gunshot or a falling tree goes over the hills anyway.
  const open = sim.world.collision.clearLine(d.x, d.y + 1.2, d.z, x, y + 0.8, z);
  if (!open && dist > reach * (range >= 80 ? 0.95 : 0.45)) return;
  d.lastHeard = { x, y, z }; d.lastHeardAt = sim.clock;
  d.alert += range >= 40 ? 2 : 1;
  d.flags |= 1;
  if (d.mode === 'rest' || d.mode === 'patrol') setMode(d, 'alert', sim);
}

function nearestTarget(sim: GameSim, d: Dino) {
  let best: SimPlayer | null = null, bd = 1e9;
  for (const p of sim.alive()) { const q = Math.hypot(p.x - d.x, p.z - d.z); if (q < bd) { bd = q; best = p; } }
  return { p: best, d: bd };
}

export function think(sim: GameSim, d: Dino) {
  const sp = SPECIES[d.species];
  if (d.mode === 'dead' || d.mode === 'scripted' || d.mode === 'flinch') return;
  // On the flats Old Scar sleeps off the middle of the day. Quiet players can use that.
  if (d.species === 'trex' && d.home && sim.time > 0.3 && sim.time < 0.4 && d.mode !== 'charge' && d.mode !== 'bite') { setMode(d, 'rest', sim); d.modeTime = 0; if (d.alert < 3) return; }
  if (sp.role !== 'pack' && sp.role !== 'apex') { ROLES[sp.role]?.(sim, d); return; }
  const pack = d.pack;
  let bestSeen: SimPlayer | null = null, bestScore = 0;
  for (const p of sim.alive()) {
    const s = sightOf(sim, d, p);
    if (s > bestScore) { bestScore = s; bestSeen = p; }
  }
  // Blood and warm bodies carry on the wind, unless mud or smoke hides them.
  for (const p of sim.alive()) {
    const dist = Math.hypot(p.x - d.x, p.z - d.z);
    if (p.scentUntil > sim.clock || sim.inSmoke(p)) continue;
    if (p.bleeding > 5 && dist < 14 + p.bleeding * 0.6) { bestSeen = bestSeen ?? p; bestScore = Math.max(bestScore, 0.5); }
  }
  if (bestSeen && Math.random() < bestScore * 1.2) {
    if (pack) { pack.target = bestSeen.id; pack.known = { x: bestSeen.x, y: bestSeen.y, z: bestSeen.z }; pack.knownAt = sim.clock; }
    d.lastHeard = { x: bestSeen.x, y: bestSeen.y, z: bestSeen.z }; d.lastHeardAt = sim.clock;
    d.alert = Math.max(d.alert, 3);
    sim.fearSpike(bestSeen, 8);
  }
  d.alert = Math.max(0, d.alert - 0.08);

  const night = sim.nightness();
  if (sp.role === 'pack') {
    // Night hunters go home at dawn.
    if (night < 0.15 && d.mode !== 'retreat') { setMode(d, 'retreat', sim); return; }
    if (pack && sim.clock < pack.hurtUntil && d.mode !== 'retreat') { setMode(d, 'retreat', sim); return; }
    if (d.mode === 'retreat') return;
    if (d.mode === 'rest' || d.mode === 'patrol' || d.mode === 'alert' || d.mode === 'investigate') {
      if (pack?.known && sim.clock - pack.knownAt < 25) { setMode(d, 'stalk', sim); return; }
      if (d.alert >= 2 && d.lastHeard) { d.goal = d.lastHeard; setMode(d, 'investigate', sim); return; }
    }
    // Firelight draws them from far away, then keeps them at the edge.
    const glow = sim.brightestGlow(d);
    if (glow && (d.mode === 'patrol' || d.mode === 'rest')) { if (pack) { pack.known = glow; pack.knownAt = sim.clock; } setMode(d, 'stalk', sim); return; }
    if (d.mode === 'stalk' && pack) {
      const { p, d: pd } = nearestTarget(sim, d);
      if (p && pd < 24) { pack.target = p.id; }
      if (sim.clock - pack.knownAt > 40 && !glow) setMode(d, 'patrol', sim);
    }
  } else {
    if (d.alert >= 3 && d.lastHeard && d.mode !== 'charge' && d.mode !== 'bite') { d.goal = d.lastHeard; setMode(d, 'investigate', sim); }
    if (bestSeen && bestScore > 0.45 && d.mode !== 'bite') { d.goal = { x: bestSeen.x, y: bestSeen.y, z: bestSeen.z }; setMode(d, 'charge', sim); }
  }
  void sp;
}

export function stepDino(sim: GameSim, d: Dino, dt: number) {
  const sp = SPECIES[d.species];
  d.modeTime += dt;
  if (sim.clock > d.thinkAt) { d.thinkAt = sim.clock + 0.9 + Math.random() * 0.2; think(sim, d); }
  const pack = d.pack;
  switch (d.mode) {
    case 'dead': d.speed = 0; d.anim = Anim.Death; break;
    case 'flinch': {
      // Knocked off its stride: a beat of backing away, then it remembers why it came.
      d.speed = 0; d.anim = Anim.Idle;
      const back = dt * (sp.run * 0.5);
      d.x += Math.sin(d.yaw) * back; d.z += Math.cos(d.yaw) * back;
      settle(sim, d);
      if (d.modeTime > 0.9) setMode(d, sp.role === 'pack' ? 'circle' : 'patrol', sim);
      break;
    }
    case 'warn': {
      // Every attack has a tell. A display first, for anyone paying attention.
      d.speed = 0; d.anim = Anim.Sniff;
      const t = nearestTarget(sim, d).p;
      if (t) { const want = Math.atan2(-(t.x - d.x), -(t.z - d.z)); d.yaw += Math.max(-sp.turn * dt, Math.min(sp.turn * dt, angDiff(d.yaw, want))); }
      if (d.modeTime > 2.6) { if (t && d.home && Math.hypot(t.x - d.home.x, t.z - d.home.z) < (sp.territory ?? 30)) setMode(d, 'charge', sim); else setMode(d, 'patrol', sim); }
      break;
    }
    case 'swoop': swoop(sim, d, dt); break;
    case 'scripted': {
      const s = d.script;
      if (!s) { d.speed = 0; d.anim = Anim.Idle; break; } // held in place, for staging
      const next = s.points[s.i];
      if (!next) { sim.endScript(d); break; }
      moveToward(sim, d, next, s.speed, dt);
      if (dist2(d, next) < 5) s.i++;
      break;
    }
    case 'rest': d.speed = 0; d.anim = Anim.Idle; if (d.modeTime > 6) setMode(d, 'patrol', sim); break;
    case 'patrol': {
      if (sp.role === 'ambush') { cruise(sim, d, dt); break; }
      if (sp.role === 'aerial') { soar(sim, d, dt); break; }
      if (!d.goal || dist2(d, d.goal) < 3 || d.modeTime > 60) { d.goal = d.home ? grazePoint(sim, d) : sim.patrolPoint(d); d.modeTime = 0; }
      moveToward(sim, d, d.goal, sp.walk * (sp.role === 'pack' ? 1.3 : 1), dt);
      if (d.home && d.modeTime > 0 && d.modeTime % 22 < dt) setMode(d, 'rest', sim);
      break;
    }
    case 'alert': {
      d.speed = 0; d.anim = Anim.Sniff;
      if (d.lastHeard) { const want = Math.atan2(-(d.lastHeard.x - d.x), -(d.lastHeard.z - d.z)); d.yaw += Math.max(-sp.turn * dt, Math.min(sp.turn * dt, angDiff(d.yaw, want))); }
      if (d.modeTime > 3.5) setMode(d, d.alert >= 2 ? 'investigate' : 'patrol', sim);
      if (d.alert >= 2 && d.lastHeard) d.goal = d.lastHeard;
      break;
    }
    case 'investigate': {
      const g = d.goal;
      if (!g) { setMode(d, 'patrol', sim); break; }
      moveToward(sim, d, g, sp.trot, dt);
      if (dist2(d, g) < 4 || d.modeTime > 26) { d.alert = 0; setMode(d, 'alert', sim); }
      break;
    }
    case 'stalk': stalk(sim, d, dt); break;
    case 'circle': circle(sim, d, dt); break;
    case 'charge': {
      const t = pack?.target != null ? sim.playerById(pack.target) : nearestTarget(sim, d).p;
      if (!t || t.dead) { setMode(d, 'stalk', sim); break; }
      const fire = sim.fireNear(t.x, t.z, FIRE_FEAR_RADIUS * 0.6);
      if (fire && sp.role === 'pack' && d.modeTime > 0.6) { setMode(d, 'retreat', sim); d.modeTime = -3; break; }
      if (sp.role === 'ambush') { const g = d.goal ?? t; moveCroc(sim, d, g, sp.run, dt); if (dist2(t, d) < sp.reach) setMode(d, 'bite', sim); if (d.modeTime > 14) setMode(d, 'patrol', sim); break; }
      // Climbing out of reach is the answer to anything that charges.
      if (d.home && (t.y - d.y > 2.4 || t.y - d.y < -4)) { setMode(d, 'patrol', sim); break; }
      moveToward(sim, d, t, sp.run, dt);
      if (dist3(t, d) < sp.reach + 0.6) setMode(d, 'bite', sim);
      if (d.modeTime > 16) setMode(d, d.species === 'trex' ? 'investigate' : sp.role === 'pack' ? 'circle' : 'patrol', sim);
      break;
    }
    case 'bite': {
      d.speed = 0; d.anim = Anim.Attack;
      const t = pack?.target != null ? sim.playerById(pack.target) : nearestTarget(sim, d).p;
      if (t && !t.dead) {
        const want = Math.atan2(-(t.x - d.x), -(t.z - d.z));
        d.yaw += Math.max(-sp.turn * dt, Math.min(sp.turn * dt, angDiff(d.yaw, want)));
        if (d.modeTime > 0.42 && sim.clock > d.biteAt) {
          d.biteAt = sim.clock + sp.biteTime;
          if (dist3(t, d) < sp.reach * 1.35 + 0.6) sim.hurtPlayer(t, sp.damage, d);
        }
      }
      if (d.modeTime > sp.biteTime) setMode(d, d.species === 'trex' ? 'charge' : sp.role !== 'pack' ? 'patrol' : Math.random() < 0.6 ? 'circle' : 'retreat', sim);
      break;
    }
    case 'retreat': {
      if (pack) { moveToward(sim, d, pack.home, sp.trot, dt); if (dist2(d, pack.home) < 8) sim.despawn(d); }
      else if (d.goal && d.species === 'trex') { moveToward(sim, d, d.goal, sp.run, dt); break; }
      else setMode(d, 'patrol', sim);
      if (sp.role === 'pack' && d.modeTime > 5 && sim.nightness() > 0.3 && sim.clock > (pack?.hurtUntil ?? 0)) setMode(d, 'stalk', sim);
      break;
    }
    case 'flee': {
      if (!d.goal) d.goal = sim.patrolPoint(d);
      moveToward(sim, d, d.goal, sp.run, dt);
      if (sp.role === 'herd') trample(sim, d);
      if (d.modeTime > (sp.role === 'herd' ? 12 : 4)) setMode(d, sp.role === 'pack' ? 'circle' : 'patrol', sim);
      break;
    }
  }
}

function stalk(sim: GameSim, d: Dino, dt: number) {
  const sp = SPECIES[d.species];
  const pack = d.pack;
  const known = pack?.known ?? d.lastHeard;
  if (!known) { setMode(d, 'patrol', sim); return; }
  moveToward(sim, d, known, sp.trot, dt);
  const near = dist2(d, known);
  const { p, d: pd } = nearestTarget(sim, d);
  if (p && pd < 16) {
    if (pack) { pack.target = p.id; pack.known = { x: p.x, y: p.y, z: p.z }; pack.knownAt = sim.clock; }
    setMode(d, 'circle', sim);
    d.angle = Math.atan2(d.z - p.z, d.x - p.x);
  } else if (near < 5) {
    // Arrived and found nothing: check spots that worked for the prey before.
    if (pack && pack.memory.length) { pack.known = pack.memory[Math.floor(Math.random() * pack.memory.length)]; pack.knownAt = sim.clock; }
    else setMode(d, 'patrol', sim);
  }
}

/**
 * Pack hunting: hold a ring, one member probes, the others cut off exits. A lit fire pushes
 * the ring outward. Only when the fire dies does the ring close.
 */
function circle(sim: GameSim, d: Dino, dt: number) {
  const sp = SPECIES[d.species];
  const pack = d.pack;
  const t = pack?.target != null ? sim.playerById(pack.target) : nearestTarget(sim, d).p;
  if (!t || t.dead) { const n = nearestTarget(sim, d); if (n.p && pack) pack.target = n.p.id; else setMode(d, 'stalk', sim); return; }
  const fire = sim.fireNear(t.x, t.z, 12);
  const ringR = fire ? Math.max(FIRE_FEAR_RADIUS + 3, Math.hypot(t.x - fire.x, t.z - fire.z) + 5) : 7;
  const cx = fire ? fire.x : t.x, cz = fire ? fire.z : t.z;
  const members = pack?.members.filter((m) => m.mode !== 'dead') ?? [d];
  const slot = members.indexOf(d);
  d.angle += dt * (0.22 + slot * 0.03) * (slot % 2 ? 1 : -1);
  const toPrey = dist3(d, t);
  const sees = toPrey < ringR + 5 && sim.world.collision.clearLine(d.x, d.y + 1, d.z, t.x, t.y + 1, t.z);
  if (!sees) {
    // A wall of rock between them: walk the real route instead of orbiting on the far side of it.
    moveToward(sim, d, t, sp.trot, dt);
  } else if (toPrey < ringR - 1 && fire) {
    // Too close to the light: back off along the line from the fire.
    const a = Math.atan2(d.z - cz, d.x - cx);
    moveToward(sim, d, { x: cx + Math.cos(a) * ringR, y: d.y, z: cz + Math.sin(a) * ringR }, sp.trot, dt);
  } else {
    const a = (slot / Math.max(1, members.length)) * Math.PI * 2 + d.angle * 0.6;
    moveToward(sim, d, { x: cx + Math.cos(a) * ringR, y: d.y, z: cz + Math.sin(a) * ringR }, sp.trot, dt);
  }
  if (pack) { pack.known = { x: t.x, y: t.y, z: t.z }; pack.knownAt = sim.clock; }
  if (d.modeTime > 2 && sees && pack && sim.clock > pack.nextProbe) {
    const inFire = sim.fireNear(t.x, t.z, FIRE_FEAR_RADIUS * 0.8);
    if (!inFire || Math.random() < 0.16) {
      // One animal commits. A chirp pattern is the tell, so a careful player can react.
      pack.nextProbe = sim.clock + (inFire ? 14 : 5) + Math.random() * 6;
      sim.sound('raptor_call', d.x, d.y, d.z);
      setMode(d, 'charge', sim);
    } else {
      pack.nextProbe = sim.clock + 4 + Math.random() * 4;
      sim.sound('raptor_chirp', d.x, d.y, d.z);
    }
  }
}

/** Somewhere near home, for an animal that is only passing the time. */
function grazePoint(sim: GameSim, d: Dino): NavPoint {
  const h = d.home!, a = sim.random() * 6.283, r = 6 + sim.random() * 18;
  const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r;
  return { x, y: sim.world.terrainAt(x, z), z };
}

/** Anything caught in front of a running herd goes under it. */
function trample(sim: GameSim, d: Dino) {
  for (const p of sim.alive()) if (Math.hypot(p.x - d.x, p.z - d.z) < d.radius + 1 && sim.clock > d.biteAt) { d.biteAt = sim.clock + 1.5; sim.hurtPlayer(p, SPECIES[d.species].damage, d); }
}

function moveCroc(sim: GameSim, d: Dino, g: NavPoint, speed: number, dt: number) {
  const want = Math.atan2(-(g.x - d.x), -(g.z - d.z));
  d.yaw += Math.max(-dt * 2, Math.min(dt * 2, angDiff(d.yaw, want)));
  d.speed = speed;
  d.x -= Math.sin(d.yaw) * speed * dt; d.z -= Math.cos(d.yaw) * speed * dt;
  d.anim = Anim.Run;
  floatAt(sim, d);
}

/** Keeps a water animal in the water. */
function floatAt(sim: GameSim, d: Dino) {
  const r = sim.world.nearestRiver(d.x, d.z);
  d.y = r.y - 0.55;
  const dist = sim.world.riverDistance(d.x, d.z).d;
  if (dist > -1.5) { d.x += (r.x - d.x) * 0.02; d.z += (r.z - d.z) * 0.02; }
}

/** A long slow drift along the channel, with only the eyes above the surface. */
function cruise(sim: GameSim, d: Dino, dt: number) {
  const r = sim.world.blobs.meta.river;
  if (!r.length) return;
  d.angle = (d.angle + dt * 0.012) % 1;
  const p = r[Math.floor(d.angle * (r.length - 1))];
  const want = Math.atan2(-(p.x - d.x), -(p.z - d.z));
  d.yaw += Math.max(-dt, Math.min(dt, angDiff(d.yaw, want)));
  d.speed = 1.4;
  d.x -= Math.sin(d.yaw) * d.speed * dt; d.z -= Math.cos(d.yaw) * d.speed * dt;
  d.anim = Anim.Walk;
  floatAt(sim, d);
}

/** High circles over open ground. */
function soar(sim: GameSim, d: Dino, dt: number) {
  const sp = SPECIES[d.species];
  d.angle += dt * 0.09;
  d.yaw = -d.angle;
  d.speed = sp.walk;
  const c = d.home ?? d.goal ?? { x: d.x, y: 0, z: d.z };
  const r = 120, x = c.x + Math.cos(d.angle) * r, z = c.z + Math.sin(d.angle) * r;
  d.x += (x - d.x) * Math.min(1, dt * 0.5); d.z += (z - d.z) * Math.min(1, dt * 0.5);
  d.y += (sim.world.terrainAt(d.x, d.z) + 70 - d.y) * Math.min(1, dt * 0.5);
  d.anim = Anim.Walk;
}

/** Dives on a lone figure out in the open. The canopy stops it. */
function swoop(sim: GameSim, d: Dino, dt: number) {
  const sp = SPECIES[d.species];
  const t = d.goal ? sim.alive().find((p) => Math.hypot(p.x - d.goal!.x, p.z - d.goal!.z) < 30) : null;
  if (!t || d.modeTime > 11) { setMode(d, 'patrol', sim); return; }
  const dx = t.x - d.x, dz = t.z - d.z, dy = t.y + 1.6 - d.y, l = Math.hypot(dx, dy, dz) || 1;
  d.goal = { x: t.x, y: t.y, z: t.z };
  d.yaw = Math.atan2(-dx, -dz);
  d.speed = sp.run;
  d.x += (dx / l) * sp.run * dt; d.y += (dy / l) * sp.run * dt; d.z += (dz / l) * sp.run * dt;
  d.anim = Anim.Run;
  if (l < sp.reach && sim.clock > d.biteAt) { d.biteAt = sim.clock + sp.biteTime; sim.hurtPlayer(t, sp.damage, d); setMode(d, 'patrol', sim); }
}

/** Living trees within a few metres mean cover from above. */
function underCanopy(sim: GameSim, p: SimPlayer) {
  const near: number[] = [];
  return sim.world.grid.query(p.x, p.z, 7, near) / 4 >= 3;
}

/** The brains of everything that does not hunt the way raptors and Old Scar do. */
const ROLES: Partial<Record<Role, (sim: GameSim, d: Dino) => void>> = {
  /** Holds ground, warns once, then comes through you. */
  territorial(sim, d) {
    const sp = SPECIES[d.species];
    if (!d.home) d.home = { x: d.x, y: d.y, z: d.z };
    const { p } = nearestTarget(sim, d);
    if (!p || d.mode === 'charge' || d.mode === 'bite' || d.mode === 'warn') return;
    const zone = sp.territory ?? 30;
    if (Math.hypot(p.x - d.home.x, p.z - d.home.z) < zone && Math.abs(p.y - d.y) < 2.4 && Math.hypot(p.x - d.x, p.z - d.z) < zone) {
      if (sim.clock > d.warned) { d.warned = sim.clock + 9; sim.sound('bellow', d.x, d.y + 2, d.z, 1); setMode(d, 'warn', sim); }
    } else if (d.mode !== 'patrol' && d.mode !== 'rest') setMode(d, 'patrol', sim);
  },
  /** Barely notices you, until something startles it. */
  obstacle(sim, d) {
    const sp = SPECIES[d.species];
    if (!d.home) d.home = { x: d.x, y: d.y, z: d.z };
    const { p, d: pd } = nearestTarget(sim, d);
    if (d.mode === 'bite') return;
    if (p && pd < sp.reach && (p.sprinting || pd < 3.2) && sim.clock > d.biteAt) { sim.sound('bellow', d.x, d.y + 1, d.z, 1); setMode(d, 'bite', sim); return; }
    if (d.mode !== 'patrol' && d.mode !== 'rest') setMode(d, 'patrol', sim);
  },
  /** Moves by the hour. Anything that frightens one starts all of them running. */
  herd(sim, d) {
    if (d.mode === 'flee') return;
    const night = sim.nightness() > 0.55;
    const goal = sim.herdGoal();
    if (night) { if (d.mode !== 'rest') setMode(d, 'rest', sim); d.modeTime = 0; return; }
    if (goal) d.home = goal;
    if (d.mode === 'rest') setMode(d, 'patrol', sim);
    const threat = sim.dinos.find((o) => SPECIES[o.species].role !== 'herd' && SPECIES[o.species].role !== 'skittish' && o.species !== 'croc' && Math.hypot(o.x - d.x, o.z - d.z) < 26);
    const loud = d.lastHeard && sim.clock - d.lastHeardAt < 1.5 && d.alert >= 2;
    if (threat || loud) { sim.stampede(threat ?? d.lastHeard!); sim.sound('bellow', d.x, d.y + 2, d.z, 1.2); d.alert = 0; }
  },
  /** Bubbles first, then nothing, then it has you. Only what is in or at the water. */
  ambush(sim, d) {
    if (d.mode === 'bite') return;
    let best: SimPlayer | null = null, bd = 60;
    for (const p of sim.alive()) {
      if (p.ride) continue; // a raft is a thing to circle, not a meal
      if (sim.world.riverDistance(p.x, p.z).d > 1.5) continue;
      const q = Math.hypot(p.x - d.x, p.z - d.z);
      if (q < bd) { bd = q; best = p; }
    }
    if (best) {
      d.goal = { x: best.x, y: best.y, z: best.z };
      if (d.mode !== 'charge') { sim.sound('splash', d.x, d.y + 1, d.z, 0.8); setMode(d, 'charge', sim); }
    } else if (d.mode !== 'patrol') setMode(d, 'patrol', sim);
  },
  aerial(sim, d) {
    if (d.mode === 'swoop') return;
    if (d.mode !== 'patrol') { setMode(d, 'patrol', sim); return; }
    if (sim.nightness() > 0.3 || sim.clock < d.warned) return;
    // A shadow first, then a scream: it takes one pass at a time, and a fire or a low crouch turns it away.
    const lone = sim.alive().filter((p) => !sim.indoors(p) && !p.crouched && !sim.fireNear(p.x, p.z, 10) && !underCanopy(sim, p) && sim.alive().every((o) => o === p || Math.hypot(o.x - p.x, o.z - p.z) > 18) && Math.hypot(p.x - d.x, p.z - d.z) < 160);
    const p = lone[0];
    if (p && sim.random() < 0.06) {
      d.warned = sim.clock + 110 + sim.random() * 80;
      d.goal = { x: p.x, y: p.y, z: p.z };
      sim.sound('screech', d.x, d.y, d.z, 1.2);
      setMode(d, 'swoop', sim);
    }
  },
  /** Scavengers. They go for the weak and scatter from light. */
  swarm(sim, d) {
    const { p, d: pd } = nearestTarget(sim, d);
    if (!p) return;
    if (sim.nightness() < 0.2) { sim.despawn(d); return; }
    if (sim.fireNear(d.x, d.z, 6) || p.lightOn || p.torch) { d.goal = sim.patrolPoint(d); setMode(d, 'flee', sim); return; }
    if (d.mode !== 'charge' && d.mode !== 'bite' && (p.bleeding > 8 || p.health < 40) && pd < 40) setMode(d, 'charge', sim);
  },
  /** Bolts from anything on two legs. */
  skittish(sim, d) {
    if (!d.home) d.home = { x: d.x, y: d.y, z: d.z };
    const { p, d: pd } = nearestTarget(sim, d);
    if (p && pd < 14 && d.mode !== 'flee') { const k = 40 / (pd || 1); d.goal = { x: d.x + (d.x - p.x) * k, y: d.y, z: d.z + (d.z - p.z) * k }; setMode(d, 'flee', sim); }
  },
};
