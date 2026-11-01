/** Ground plants, trees, rocks and dead wood. All geometry is instanced. */
import * as THREE from 'three/webgpu';
import { attribute, texture, uniform, vec3, vec2, float, time, sin, cos, dot, positionLocal, positionGeometry, normalMap, mix, fract, length, smoothstep, int, varying } from 'three/tsl';
import { HALF_WORLD, WORLD_SIZE } from '@dino/shared/world/constants.ts';
import { BASE, fetchGz, loadGLB, loadMaterialArrays, loadTexture, pixelsToTexture } from '../assets.ts';
import { Scatter, type LodSpec } from './Scatter.ts';
import { LAYER_NEAR_ONLY } from './Stage.ts';
import type { WorldData } from '../world.ts';

const hash = (x: number, z: number) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

/** World-space sway. `weight` is 0 at the root, 1 at the tip. */
// TSL node chains are dynamically typed.
type N = any;

function windOffset(weight: N, strength: N, amp: number): N {
  const p = positionLocal.xz;
  const a = dot(p, vec2(0.11, 0.13)).add(time.mul(1.1));
  const b = dot(p, vec2(0.67, 0.51)).add(time.mul(2.7));
  const sway = sin(a).mul(0.6).add(sin(b).mul(0.25));
  const sway2 = cos(a.mul(0.83)).mul(0.5).add(cos(b.mul(1.2)).mul(0.2));
  return vec3(sway, sway2.mul(0.3), sway2).mul(weight).mul(strength).mul(amp);
}

/** How much sky a point under the forest canopy can see. The HDRI knows nothing about trees. */
export function canopyAO(density: THREE.Texture, strength = 0.8): N {
  const uv = positionLocal.xz.add(HALF_WORLD).div(WORLD_SIZE);
  const c = varying(texture(density, uv as N).level(float(2) as N).b);
  return float(1).sub(c.mul(strength));
}

function foliageMaterial(map: THREE.Texture, normal: THREE.Texture | null, rough: number, weight: N, wind: N, amp: number, tint: THREE.Color, ao?: N, skyAO?: N) {
  const mat = new THREE.MeshSSSNodeMaterial();
  const t = texture(map);
  const hueSeed = fract(dot(positionLocal.xz.div(9).floor(), vec2(0.13, 0.31)).sin().mul(431.7)) as N;
  const base = t.rgb.mul(vec3(tint.r, tint.g, tint.b)).mul(mix(vec3(0.82, 0.9, 0.7), vec3(1.08, 1.04, 0.86), hueSeed));
  mat.colorNode = ao ? base.mul(ao) : base;
  mat.opacityNode = t.a;
  mat.alphaTest = 0.42;
  mat.alphaMap = map;
  mat.side = THREE.DoubleSide;
  mat.roughnessNode = float(rough);
  mat.metalnessNode = float(0);
  if (skyAO) mat.aoNode = skyAO;
  if (normal) mat.normalNode = normalMap(texture(normal).xyz as N, float(0.8) as N);
  mat.positionNode = (positionLocal as N).add(windOffset(weight, wind, amp));
  mat.thicknessColorNode = t.rgb.mul(vec3(0.5, 0.56, 0.2));
  mat.thicknessDistortionNode = float(0.25);
  mat.thicknessAmbientNode = float(0.02);
  mat.thicknessAttenuationNode = float(0.75);
  mat.thicknessPowerNode = float(2.6);
  mat.thicknessScaleNode = float(1.6);
  return mat;
}

export class Flora {
  group = new THREE.Group();
  wind = uniform(1);
  scatters: Scatter[] = [];
  private frustum = new THREE.Frustum();
  private pv = new THREE.Matrix4();
  private density!: THREE.Texture;

  constructor(private world: WorldData, private floraR: number, private treeR: number) {}

  async init() {
    this.density = pixelsToTexture(this.world.density);
    await Promise.all([this.initTrees(), this.initGround(), this.initRocks()]);
    for (const s of this.scatters) this.group.add(s.group);
  }

  private async initTrees() {
    const dir: { kind: number; lod: number; part: string; verts: number; tris: number; off: number }[] = await fetch(`${BASE}world/trees-geo.json`).then((r) => r.json());
    const bin = await fetchGz('world/trees-geo.bin.gz');
    const geos = new Map<string, THREE.BufferGeometry>();
    for (const d of dir) {
      let o = d.off;
      const take = <T extends Float32Array | Uint32Array>(ctor: new (b: ArrayBuffer, o: number, n: number) => T, n: number) => { const a = new ctor(bin, o, n); o += a.byteLength; return a; };
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(take(Float32Array, d.verts * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(take(Float32Array, d.verts * 3), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(take(Float32Array, d.verts * 2), 2));
      g.setAttribute('windAo', new THREE.BufferAttribute(take(Float32Array, d.verts * 2), 2));
      g.setIndex(new THREE.BufferAttribute(take(Uint32Array, d.tris * 3), 1));
      geos.set(`${d.kind}/${d.lod}/${d.part}`, g);
    }
    const barks = await loadMaterialArrays(['b_redwood', 'b_moss', 'b_palm', 'b_pine'], 1024, 8);
    const windAo = attribute('windAo', 'vec2') as N;
    const barkMat = (layer: number, tint: THREE.Color) => {
      const m = new THREE.MeshStandardNodeMaterial();
      const uvs = attribute('uv', 'vec2').mul(vec2(1, 0.5));
      const a = texture(barks.albedo, uvs).depth(int(layer)), b = texture(barks.data, uvs).depth(int(layer));
      m.colorNode = a.rgb.mul(vec3(tint.r, tint.g, tint.b)).mul(windAo.y);
      m.roughnessNode = b.b;
      m.metalnessNode = float(0);
      m.aoNode = b.a.mul(canopyAO(this.density, 0.42));
      m.normalNode = normalMap(vec3(b.r, b.g, 1) as N, float(1.3) as N);
      m.positionNode = (positionLocal as N).add(windOffset(windAo.x.mul(windAo.x), this.wind, 0.5));
      return m;
    };
    const [fir, firN, fern, fernN, jac, jacN] = await Promise.all([
      loadTexture('tex/leaf_fir_tree_01.webp', true), loadTexture('tex/leaf_fir_tree_01_n.jpg', false),
      loadTexture('tex/leaf_fern_02.webp', true), loadTexture('tex/leaf_fern_02_n.jpg', false),
      loadTexture('tex/leaf_jacaranda_tree.webp', true), loadTexture('tex/leaf_jacaranda_tree_n.jpg', false),
    ]);
    const leafMat = (map: THREE.Texture, n: THREE.Texture, tint: THREE.Color) => foliageMaterial(map, n, 0.55, windAo.x, this.wind, 0.34, tint, windAo.y, canopyAO(this.density, 0.45));
    const defs = [
      { kind: 0, bark: barkMat(0, new THREE.Color(0.86, 0.72, 0.62)), leaf: leafMat(fir, firN, new THREE.Color(0.5, 0.62, 0.42)) },
      { kind: 1, bark: barkMat(1, new THREE.Color(0.8, 0.78, 0.7)), leaf: leafMat(jac, jacN, new THREE.Color(0.58, 0.68, 0.42)) },
      { kind: 2, bark: barkMat(2, new THREE.Color(0.52, 0.42, 0.34)), leaf: leafMat(fern, fernN, new THREE.Color(0.58, 0.7, 0.44)) },
      { kind: 3, bark: barkMat(2, new THREE.Color(0.7, 0.62, 0.52)), leaf: leafMat(fern, fernN, new THREE.Color(0.66, 0.68, 0.42)) },
      { kind: 4, bark: barkMat(3, new THREE.Color(0.62, 0.6, 0.57)), leaf: null },
    ];
    const near = 38;
    const scatters = defs.map((d) => {
      const spec = (lod: number, maxDist: number, capacity: number): LodSpec => ({
        maxDist, capacity,
        parts: [
          { geometry: geos.get(`${d.kind}/${lod}/bark`)!, material: d.bark, castShadow: true },
          ...(d.leaf ? [{ geometry: geos.get(`${d.kind}/${lod}/leaf`)!, material: d.leaf, castShadow: true }] : []),
        ],
      });
      return new Scatter([spec(0, near, 160), spec(1, this.treeR, 2600)], 48, 26);
    });
    const t = this.world.trees;
    for (let i = 0; i < t.length; i += 6) scatters[t[i]].add(t[i + 1], t[i + 2] - 0.15, t[i + 3], t[i + 4], t[i + 5]);
    this.scatters.push(...scatters);
  }

  private async initGround() {
    const w = this.world;
    const gather = async (file: string, pick: RegExp) => {
      const g = await loadGLB(file);
      const lods = new Map<number, THREE.Mesh[]>();
      g.scene.updateMatrixWorld(true);
      g.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const name = o.name || o.parent?.name || '';
        const lod = Number(/_lod(\d)/.exec(name)?.[1] ?? 0);
        if (!pick.test(name)) return;
        if (!lods.has(lod)) lods.set(lod, []);
        lods.get(lod)!.push(mesh);
      });
      return lods;
    };
    const amp = 0.06;
    const makeMat = (m: THREE.MeshStandardMaterial, tint: THREE.Color) => {
      m.map!.colorSpace = THREE.SRGBColorSpace;
      const weight = smoothstep(0.02, 1.0, length(positionGeometry)).mul(1.6);
      return foliageMaterial(m.map!, m.normalMap, 0.6, weight as never, this.wind, amp * 2.2, tint, undefined, canopyAO(this.density, 0.86));
    };

    const fern = await gather('fern_02', /./);
    const fm = makeMat(fern.get(0)![0].material as THREE.MeshStandardMaterial, new THREE.Color(0.6, 0.72, 0.46));
    const shrub = await gather('shrub_04', /./);
    const sm = makeMat(shrub.get(0)![0].material as THREE.MeshStandardMaterial, new THREE.Color(0.52, 0.66, 0.42));
    const weed = await gather('weed_plant_02', /./);
    const wm = makeMat(weed.get(0)![0].material as THREE.MeshStandardMaterial, new THREE.Color(0.54, 0.68, 0.44));

    const R = this.floraR;
    const single = (lods: Map<number, THREE.Mesh[]>, variant: number, mat: THREE.Material, dists: number[], caps: number[], shadows = 1): LodSpec[] =>
      dists.map((maxDist, l) => {
        const list = lods.get(Math.min(l, lods.size - 1))!;
        return { maxDist, capacity: caps[l], parts: [{ geometry: list[variant % list.length].geometry, material: mat, castShadow: l < shadows, layer: LAYER_NEAR_ONLY }] };
      });
    const fernA = new Scatter(single(fern, 0, fm, [12, 32, R], [260, 1100, 3600]), 24, 3);
    const fernB = new Scatter(single(fern, 1, fm, [12, 32, R], [260, 1100, 3600]), 24, 3);
    const shrubS = new Scatter(single(shrub, 0, sm, [12, 34, R * 0.6], [80, 360, 900]), 24, 3);
    const weedS = new Scatter(single(weed, 0, wm, [10, 26], [160, 600], 0), 24, 2);

    // Deterministic scatter driven by the baked density map.
    const D = w.density.width, data = w.density.data;
    const ds = WORLD_SIZE / D;
    const size = WORLD_SIZE;
    const fernSpacing = 2.1, shrubSpacing = 5.5, weedSpacing = 4.5;
    // Keep ground around gatherable things and story objects clear, so they can actually be seen.
    const CLEAR = 2.8, keepClear = new Map<number, [number, number][]>();
    const cellOf = (i: number, j: number) => i * 8192 + j;
    for (const n of [...w.meta.nodes, ...w.meta.props]) {
      const k = cellOf(Math.floor((n.x + HALF_WORLD) / CLEAR), Math.floor((n.z + HALF_WORLD) / CLEAR));
      keepClear.set(k, [...(keepClear.get(k) ?? []), [n.x, n.z]]);
    }
    const cleared = (x: number, z: number) => {
      const i = Math.floor((x + HALF_WORLD) / CLEAR), j = Math.floor((z + HALF_WORLD) / CLEAR);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++)
        for (const [px, pz] of keepClear.get(cellOf(i + a, j + b)) ?? []) if (Math.hypot(x - px, z - pz) < CLEAR) return true;
      return false;
    };
    const scatterType = (spacing: number, channel: number, add: (x: number, y: number, z: number, yaw: number, r: number) => void) => {
      const n = Math.floor(size / spacing);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const r0 = hash(i * 1.17, j * 0.83), r1 = hash(i * 2.31, j * 3.17), r2 = hash(i * 5.3, j * 7.1), r3 = hash(i * 0.37, j * 9.3);
        const x = (i + r0) * spacing - HALF_WORLD, z = (j + r1) * spacing - HALF_WORLD;
        const px = Math.min(D - 1, Math.floor((x + HALF_WORLD) / ds)), pz = Math.min(D - 1, Math.floor((z + HALF_WORLD) / ds));
        const dens = data[(pz * D + px) * 4 + channel] / 255;
        if (r2 > dens) continue;
        if (w.isHole(x, z) || cleared(x, z)) continue;
        add(x, w.heightAt(x, z) - 0.04, z, r3 * 6.283, r0);
      }
    };
    scatterType(fernSpacing, 0, (x, y, z, yaw, r) => { (r < 0.5 ? fernA : fernB).add(x, y, z, yaw, 1.5 + r * 1.3); });
    scatterType(shrubSpacing, 1, (x, y, z, yaw, r) => { shrubS.add(x, y, z, yaw, 1.2 + r * 1.2); });
    scatterType(weedSpacing, 1, (x, y, z, yaw, r) => { weedS.add(x, y, z, yaw, 0.9 + r * 0.9); });
    this.scatters.push(fernA, fernB, shrubS, weedS);
  }

  private async initRocks() {
    const files = ['rock_07', 'rock_09', 'rock_face_01', 'rock_face_02', 'rock_moss_set_01', 'rock_moss_set_02', 'stone_01'];
    const rockSpec = async (file: string, variant: number): Promise<{ specs: LodSpec[] }> => {
      const g = await loadGLB(file);
      const byLod = new Map<number, THREE.Mesh[]>();
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const lod = Number(/_lod(\d)/.exec(o.name || o.parent?.name || '')?.[1] ?? 0);
        if (!byLod.has(lod)) byLod.set(lod, []);
        byLod.get(lod)!.push(m);
      });
      const dist = [28, 90, 340];
      const specs: LodSpec[] = [];
      for (let l = 0; l < 3; l++) {
        const list = byLod.get(Math.min(l, byLod.size - 1))!;
        const mesh = list[variant % list.length];
        const std = mesh.material as THREE.MeshStandardMaterial;
        const mat = new THREE.MeshStandardNodeMaterial();
        mat.map = std.map; mat.normalMap = std.normalMap; mat.roughnessMap = std.roughnessMap; mat.metalnessMap = null; mat.metalness = 0; mat.roughness = 1;
        mat.aoNode = canopyAO(this.density, 0.7);
        specs.push({ maxDist: dist[l], capacity: l === 2 ? 800 : 200, parts: [{ geometry: mesh.geometry, material: mat, castShadow: l < 2 }] });
      }
      return { specs };
    };
    const all = await Promise.all(files.map((f, i) => rockSpec(f, i)));
    const scatters = all.map((a) => new Scatter(a.specs, 48, 8));
    const r = this.world.rocks;
    for (let i = 0; i < r.length; i += 6) scatters[Math.min(r[i], scatters.length - 1)].add(r[i + 1], r[i + 2] - 0.15 * r[i + 5], r[i + 3], r[i + 4], r[i + 5]);
    const logFiles = ['dead_tree_trunk', 'dead_tree_trunk_02', 'tree_stump_01', 'tree_stump_02', 'root_cluster_01'];
    const logs = await Promise.all(logFiles.map((f) => rockSpec(f, 0)));
    const logScatters = logs.map((a) => new Scatter(a.specs, 48, 8));
    const l = this.world.logs;
    for (let i = 0; i < l.length; i += 6) logScatters[l[i]].add(l[i + 1], l[i + 2] - 0.05, l[i + 3], l[i + 4], l[i + 5] * 1.6);
    this.scatters.push(...scatters, ...logScatters);
  }

  update(camera: THREE.PerspectiveCamera) {
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    // A couple of rebuilds per frame: doing them all at once shows up as a hitch at running speed.
    if (!this.primed) { this.primed = true; for (const s of this.scatters) s.update(camera, this.frustum, true); return; }
    for (let i = 0, done = 0; i < this.scatters.length && done < 2; i++) {
      this.cursor = (this.cursor + 1) % this.scatters.length;
      if (this.scatters[this.cursor].update(camera, this.frustum)) done++;
    }
  }
  private cursor = 0;
  private primed = false;
}
