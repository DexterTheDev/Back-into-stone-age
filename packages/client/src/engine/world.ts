/** Baked world data used by rendering, prediction and audio on the client. */
import { HALF_WORLD, HEIGHT_RES, HEIGHT_SCALE, type WorldMeta } from '@dino/shared/world/constants.ts';
import { BASE, fetchGz, loadPixels, type Pixels } from './assets.ts';

export class WorldData {
  constructor(public id = 'hollow') {}
  /** Each map's bake lives in its own folder. The Hollow is the root. */
  private get dir() { return this.id === 'hollow' ? 'world/' : `world/${this.id}/`; }
  heights!: Float32Array;
  meta!: WorldMeta;
  density!: Pixels;
  splat0!: Pixels;
  splat1!: Pixels;
  hole!: Pixels;
  normals!: Uint8Array;
  trees!: Float32Array;
  rocks!: Float32Array;
  logs!: Float32Array;
  cave!: { positions: Float32Array; normals: Int8Array; attrs: Uint8Array; indices: Uint32Array; chunks: { start: number; count: number; min: number[]; max: number[] }[] };

  async load(onProgress: (p: number, label: string) => void) {
    const steps = 6;
    let done = 0;
    const tick = <T,>(label: string, p: Promise<T>) => p.then((v) => { onProgress(++done / steps, label); return v; });
    const [h16, meta, density, splat0, splat1, hole] = await Promise.all([
      tick('terrain', fetchGz(`${this.dir}height.bin.gz`)),
      tick('world', fetch(`${BASE}${this.dir}meta.json`).then((r) => r.json() as Promise<WorldMeta>)),
      tick('flora', loadPixels(`${this.dir}density.png`)),
      tick('materials', loadPixels(`${this.dir}splat0.png`)),
      tick('materials', loadPixels(`${this.dir}splat1.png`)),
      tick('cave', loadPixels(`${this.dir}hole.png`)),
    ]);
    const u16 = new Uint16Array(h16);
    this.heights = new Float32Array(u16.length);
    for (let i = 0; i < u16.length; i++) this.heights[i] = u16[i] / HEIGHT_SCALE;
    this.meta = meta; this.density = density; this.splat0 = splat0; this.splat1 = splat1; this.hole = hole;
    this.buildNormals();
    const [trees, rocks, logs, p, n, a, i, chunks] = await Promise.all([
      fetchGz(`${this.dir}trees.bin.gz`), fetchGz(`${this.dir}rocks.bin.gz`), fetchGz(`${this.dir}logs.bin.gz`),
      fetchGz(`${this.dir}cave-pos.bin.gz`), fetchGz(`${this.dir}cave-nrm.bin.gz`), fetchGz(`${this.dir}cave-attr.bin.gz`), fetchGz(`${this.dir}cave-idx.bin.gz`),
      fetch(`${BASE}${this.dir}cave-chunks.json`).then((r) => r.json()),
    ]);
    this.trees = new Float32Array(trees); this.rocks = new Float32Array(rocks); this.logs = new Float32Array(logs);
    this.cave = { positions: new Float32Array(p), normals: new Int8Array(n), attrs: new Uint8Array(a), indices: new Uint32Array(i), chunks };
  }

  /** Prediction collision files for this map. */
  collisionFiles() { return [`${this.dir}phys-height.bin.gz`, `${this.dir}cave-col-pos.bin.gz`, `${this.dir}cave-col-idx.bin.gz`, `${this.dir}obstacles.bin.gz`]; }

  private buildNormals() {
    const N = HEIGHT_RES, h = this.heights;
    const out = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const l = h[j * N + Math.max(i - 1, 0)], r = h[j * N + Math.min(i + 1, N - 1)];
      const d = h[Math.max(j - 1, 0) * N + i], u = h[Math.min(j + 1, N - 1) * N + i];
      const nx = l - r, nz = d - u, ny = 2;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const o = (j * N + i) * 4;
      out[o] = ((nx / len) * 0.5 + 0.5) * 255; out[o + 1] = ((ny / len) * 0.5 + 0.5) * 255; out[o + 2] = ((nz / len) * 0.5 + 0.5) * 255; out[o + 3] = 255;
    }
    this.normals = out;
  }

  heightAt(x: number, z: number): number {
    const N = HEIGHT_RES;
    const fx = Math.max(0, Math.min(N - 1.001, x + HALF_WORLD)), fz = Math.max(0, Math.min(N - 1.001, z + HALF_WORLD));
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, h = this.heights;
    const a = h[j * N + i], b = h[j * N + i + 1], c = h[(j + 1) * N + i], d = h[(j + 1) * N + i + 1];
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }

  isHole(x: number, z: number): boolean {
    const N = this.hole.width;
    const i = Math.round(x + HALF_WORLD), j = Math.round(z + HALF_WORLD);
    if (i < 0 || j < 0 || i >= N || j >= N) return false;
    return this.hole.data[(j * N + i) * 4] > 127;
  }
}
