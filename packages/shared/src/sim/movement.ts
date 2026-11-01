/** Player movement, shared by the authoritative simulation and client prediction. */
import type RAPIER from '@dimforge/rapier3d-compat';
import { HALF_WORLD } from '../world/constants.ts';

export const PLAYER = {
  radius: 0.34, halfHeight: 0.56, crouchHalf: 0.26,
  walk: 4.4, sprint: 7.8, crouch: 2.4, wade: 2,
  /** Per-second rates: how quickly velocity closes on what the keys ask for. */
  accel: 13, brake: 17, airAccel: 2.5,
  gravity: 22, jump: 6.6, eye: 1.62, crouchEye: 0.98,
  /** Soft wall inside the map-edge mountains. */
  bound: HALF_WORLD - 120,
} as const;

export const enum Btn { Forward = 1, Back = 2, Left = 4, Right = 8, Sprint = 16, Crouch = 32, Jump = 64 }

export interface MoveState { x: number; y: number; z: number; vx: number; vy: number; vz: number; yaw: number; grounded: boolean; crouched: boolean; stamina: number }
export interface MoveInput { seq: number; buttons: number; yaw: number; pitch: number }

export interface Obstacles { query(x: number, z: number, r: number, out: number[]): number }

/** Static collision world: terrain height-field, cave trimesh, one capsule per actor. */
export class CollisionWorld {
  world: RAPIER.World;
  controller: RAPIER.KinematicCharacterController;

  constructor(private R: typeof RAPIER, heights: Float32Array, res: number, size: number, cavePos: Float32Array, caveIdx: Uint32Array, private obstacles: Obstacles) {
    this.world = new R.World({ x: 0, y: 0, z: 0 });
    // Rapier stores heights column-major with x along columns.
    const h = new Float32Array(res * res);
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) h[i * res + j] = heights[j * res + i];
    this.world.createCollider(R.ColliderDesc.heightfield(res - 1, res - 1, h, { x: size, y: 1, z: size }));
    this.world.createCollider(R.ColliderDesc.trimesh(cavePos, caveIdx));
    this.controller = this.world.createCharacterController(0.03);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setMaxSlopeClimbAngle((54 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((62 * Math.PI) / 180);
    this.controller.enableAutostep(0.46, 0.18, true);
    this.controller.enableSnapToGround(0.5);
    this.controller.setSlideEnabled(true);
    this.world.step();
  }

  private blocks = new Map<string, RAPIER.Collider>();

  /** Solid things the players build: doors, seals, platforms. Off removes it. */
  setBlock(id: string, on: boolean, x = 0, y = 0, z = 0, hx = 1, hy = 1, hz = 1, yaw = 0) {
    const old = this.blocks.get(id);
    if (old) { this.world.removeCollider(old, false); this.blocks.delete(id); }
    if (on) {
      const s = Math.sin(yaw / 2), c = Math.cos(yaw / 2);
      this.blocks.set(id, this.world.createCollider(this.R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setRotation({ x: 0, y: s, z: 0, w: c })));
    }
    this.world.step();
  }

  capsule(): RAPIER.Collider {
    const c = this.world.createCollider(this.R.ColliderDesc.capsule(PLAYER.halfHeight, PLAYER.radius).setTranslation(0, 100, 0));
    this.world.step();
    return c;
  }

  raycastDown(x: number, y: number, z: number, max = 400): number | null {
    // A vertical ray through an exact height-field vertex can slip between cells. Nudge it off the grid.
    const hit = this.world.castRay(new this.R.Ray({ x: x + 0.0071, y, z: z + 0.0053 }, { x: 0, y: -1, z: 0 }), max, true);
    return hit ? y - hit.timeOfImpact : null;
  }

  /** True when an unobstructed line exists. Used for hearing through open paths, and sight. */
  clearLine(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    return this.world.castRay(new this.R.Ray({ x: ax, y: ay, z: az }, { x: dx / len, y: dy / len, z: dz / len }), len, true) === null;
  }

  /** Distance along a ray to the first solid surface, or max. */
  rayDistance(ax: number, ay: number, az: number, dx: number, dy: number, dz: number, max: number) {
    const hit = this.world.castRay(new this.R.Ray({ x: ax, y: ay, z: az }, { x: dx, y: dy, z: dz }), max, true);
    return hit ? hit.timeOfImpact : max;
  }

  private near: number[] = [];

  /** Advances one actor by dt. Input yaw is authoritative for direction. */
  step(col: RAPIER.Collider, s: MoveState, buttons: number, yaw: number, dt: number, speedScale: number) {
    const f = (buttons & Btn.Forward ? 1 : 0) - (buttons & Btn.Back ? 1 : 0);
    const r = (buttons & Btn.Right ? 1 : 0) - (buttons & Btn.Left ? 1 : 0);
    const crouch = (buttons & Btn.Crouch) !== 0;
    const wantSprint = (buttons & Btn.Sprint) !== 0 && !crouch && f > 0 && s.stamina > 2;
    let speed: number = crouch ? PLAYER.crouch : wantSprint ? PLAYER.sprint : PLAYER.walk;
    speed *= speedScale;
    const len = Math.hypot(f, r) || 1;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    // Forward is -Z at yaw 0.
    const wantX = ((-sn * f + cs * r) / len) * speed, wantZ = ((-cs * f - sn * r) / len) * speed;
    // Ease toward the wanted velocity: quick to start, quick to stop, never a hard snap.
    const moving = f !== 0 || r !== 0;
    const k = 1 - Math.exp(-(s.grounded ? (moving ? PLAYER.accel : PLAYER.brake) : PLAYER.airAccel) * dt);
    s.vx += (wantX - s.vx) * k; s.vz += (wantZ - s.vz) * k;
    const vx = s.vx, vz = s.vz;
    if (s.grounded) {
      s.vy = -2;
      if (buttons & Btn.Jump && s.stamina > 8) { s.vy = PLAYER.jump; s.grounded = false; s.stamina -= 8; }
    } else s.vy -= PLAYER.gravity * dt;

    col.setTranslation({ x: s.x, y: s.y + PLAYER.halfHeight + PLAYER.radius, z: s.z });
    this.controller.computeColliderMovement(col, { x: vx * dt, y: s.vy * dt, z: vz * dt });
    const m = this.controller.computedMovement();
    s.x += m.x; s.y += m.y; s.z += m.z;
    s.grounded = this.controller.computedGrounded();
    if (s.grounded && s.vy < 0) s.vy = 0;

    // Trees and big boulders are circles, cheaper than thousands of colliders.
    const n = this.obstacles.query(s.x, s.z, 3, this.near);
    for (let i = 0; i < n; i += 4) {
      if (Math.abs(this.near[i + 3] - s.y) > 6) continue; // a tree on the hill above a cave is not in the cave
      const ox = this.near[i], oz = this.near[i + 1], rr = this.near[i + 2] + PLAYER.radius;
      const dx = s.x - ox, dz = s.z - oz, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-5) { const d = Math.sqrt(d2), k = (rr - d) / d; s.x += dx * k; s.z += dz * k; }
    }
    const b = PLAYER.bound;
    s.x = Math.max(-b, Math.min(b, s.x)); s.z = Math.max(-b, Math.min(b, s.z));
    s.yaw = yaw;
    s.crouched = crouch;
    if (wantSprint && moving) s.stamina = Math.max(0, s.stamina - 9 * dt);
    else s.stamina = Math.min(100, s.stamina + (moving ? 5 : 9) * dt);
    return { moving: moving || Math.hypot(s.vx, s.vz) > 0.4, sprinting: wantSprint && moving };
  }
}

/** Uniform grid of circle obstacles, stored as x, z, radius, ground height. */
export class ObstacleGrid implements Obstacles {
  private cells = new Map<number, number[]>();
  constructor(data: Float32Array, private cell = 8) {
    for (let i = 0; i < data.length; i += 4) {
      const k = this.key(Math.floor(data[i] / cell), Math.floor(data[i + 1] / cell));
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, (c = []));
      c.push(data[i], data[i + 1], data[i + 2], data[i + 3]);
    }
  }
  private key(i: number, j: number) { return (i + 512) * 4096 + (j + 512); }
  query(x: number, z: number, r: number, out: number[]) {
    let n = 0;
    const c = this.cell, i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c), j0 = Math.floor((z - r) / c), j1 = Math.floor((z + r) / c);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const list = this.cells.get(this.key(i, j));
      if (!list) continue;
      for (let k = 0; k < list.length; k++) out[n++] = list[k];
    }
    return n;
  }
}
