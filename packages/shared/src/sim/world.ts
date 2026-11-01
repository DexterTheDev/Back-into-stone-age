/** Loads the baked world into the collision and navigation structures the simulation needs. */
import type RAPIER from '@dimforge/rapier3d-compat';
import { PHYS_RES, WORLD_SIZE, type WorldMeta } from '../world/constants.ts';
import { CollisionWorld, ObstacleGrid } from './movement.ts';

export interface WorldBlobs {
  meta: WorldMeta;
  physHeights: Float32Array;
  cavePos: Float32Array;
  caveIdx: Uint32Array;
  obstacles: Float32Array;
  nav: Uint8Array | null;
}

export interface NavPoint { x: number; y: number; z: number }
export interface Nav { path(a: NavPoint, b: NavPoint): NavPoint[]; nearest(p: NavPoint): NavPoint | null; }

export class SimWorld {
  collision: CollisionWorld;
  grid: ObstacleGrid;
  constructor(R: typeof RAPIER, public blobs: WorldBlobs, public nav: Nav | null) {
    this.grid = new ObstacleGrid(blobs.obstacles);
    this.collision = new CollisionWorld(R, blobs.physHeights, PHYS_RES, WORLD_SIZE, blobs.cavePos, blobs.caveIdx, this.grid);
  }
  /** Top surface of the world at a point: terrain, or the rock patch around the cave. */
  terrainAt(x: number, z: number) {
    return this.collision.raycastDown(x, 600, z, 800) ?? 0;
  }
  /** True with solid rock overhead. */
  underRock(x: number, y: number, z: number) {
    return !this.collision.clearLine(x, y + 1.7, z, x, y + 200, z);
  }
  floorAt(x: number, y: number, z: number) {
    return this.collision.raycastDown(x, y + 2.5, z, 30) ?? this.terrainAt(x, z);
  }
  /** The closest point on the bank to someone standing here. */
  nearestRiver(x: number, z: number) {
    let best = this.blobs.meta.river[0], bd = 1e9;
    for (const p of this.blobs.meta.river) { const d = Math.hypot(p.x - x, p.z - z) - p.w; if (d < bd) { bd = d; best = p; } }
    const l = Math.max(1, Math.hypot(best.x - x, best.z - z)), k = Math.max(0, l - best.w) / l;
    return { x: x + (best.x - x) * k, y: best.y, z: z + (best.z - z) * k };
  }
  /** Calloway's walkways, anywhere the map has them. */
  applyPlatforms() {
    (this.blobs.meta.platforms ?? []).forEach((p, i) => this.collision.setBlock(`platform${i}`, true, p.x, p.y, p.z, p.hx, p.hy, p.hz, p.yaw ?? 0));
  }
  riverDistance(x: number, z: number) {
    let best = 1e9, w = 0, y = 0;
    for (const p of this.blobs.meta.river) { const d = Math.hypot(x - p.x, z - p.z); if (d < best) { best = d; w = p.w; y = p.y; } }
    return { d: best - w, y };
  }
}
