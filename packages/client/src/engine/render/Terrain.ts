/** Height-field terrain: instanced grid patches with height-blended PBR layers. */
import * as THREE from 'three/webgpu';
import { Fn, attribute, positionGeometry, vec3, float, int, ivec2, textureLoad, texture, normalize, mix, max, smoothstep, cameraPosition, length, transformNormalToView, positionWorld, clamp, uniform } from 'three/tsl';
import { HALF_WORLD, HEIGHT_RES, LAYERS, WORLD_SIZE } from '@dino/shared/world/constants.ts';
import { loadMaterialArrays, pixelsToTexture } from '../assets.ts';
import type { WorldData } from '../world.ts';

const PATCH = 128;
const LOD_QUADS = [64, 32, 16, 8];

function patchGeometry(quads: number, capacity: number) {
  const g = new THREE.InstancedBufferGeometry();
  const verts: number[] = [];
  const idx: number[] = [];
  // Main grid plus a border ring dropped as a skirt, so LOD seams never show sky.
  const total = quads + 3;
  for (let j = 0; j < total; j++) for (let i = 0; i < total; i++) {
    const gi = Math.min(Math.max(i - 1, 0), quads), gj = Math.min(Math.max(j - 1, 0), quads);
    const skirt = i === 0 || j === 0 || i === total - 1 || j === total - 1 ? 1 : 0;
    verts.push(gi / quads, skirt, gj / quads);
  }
  for (let j = 0; j < total - 1; j++) for (let i = 0; i < total - 1; i++) {
    const a = j * total + i, b = a + 1, c = a + total, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.setAttribute('iPatch', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.instanceCount = 0;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

export class Terrain {
  meshes: THREE.Mesh[] = [];
  group = new THREE.Group();
  rain = uniform(0);
  private frustum = new THREE.Frustum();
  private m = new THREE.Matrix4();
  private box = new THREE.Box3();

  constructor(private world: WorldData) {}

  async init(anisotropy: number) {
    const w = this.world;
    const N = HEIGHT_RES;
    const heightTex = new THREE.DataTexture(w.heights, N, N, THREE.RedFormat, THREE.FloatType);
    heightTex.minFilter = heightTex.magFilter = THREE.NearestFilter;
    heightTex.needsUpdate = true;
    const normalTex = new THREE.DataTexture(w.normals, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    normalTex.minFilter = THREE.LinearMipmapLinearFilter; normalTex.magFilter = THREE.LinearFilter; normalTex.generateMipmaps = true; normalTex.needsUpdate = true;
    const splat0 = pixelsToTexture(w.splat0), splat1 = pixelsToTexture(w.splat1);
    const hole = pixelsToTexture(w.hole, { nearest: true });
    const density = pixelsToTexture(w.density);
    const { albedo, data } = await loadMaterialArrays(LAYERS.map((l) => `t_${l}`), 1024, anisotropy);

    const half = float(HALF_WORLD);
    const iPatch = attribute('iPatch', 'vec3');
    const worldXZ = positionGeometry.xz.mul(iPatch.z).add(iPatch.xy);

    const mat = new THREE.MeshStandardNodeMaterial();
    mat.positionNode = Fn(() => {
      const c = ivec2(worldXZ.add(half).add(0.5).floor());
      const h = textureLoad(heightTex, c).r;
      return vec3(worldXZ.x, h.sub(positionGeometry.y.mul(iPatch.z).mul(0.08)), worldXZ.y);
    })();

    const wp = positionWorld.xz;
    const uv = wp.add(half).div(WORLD_SIZE);
    const dist = length(positionWorld.sub(cameraPosition));
    const farMix = smoothstep(35, 120, dist);

    const scales = [0.31, 0.27, 0.11, 0.42, 0.24, 0.29];
    const look = w.meta.look?.tints;
    const tints = (look ?? [[0.5, 0.52, 0.4], [0.62, 0.58, 0.52], [0.72, 0.7, 0.66], [0.8, 0.77, 0.72], [0.6, 0.57, 0.5], [0.62, 0.74, 0.5]]).map((c) => vec3(c[0], c[1], c[2]));

    const s0 = texture(splat0, uv), s1 = texture(splat1, uv);
    const weights = [s0.r, s0.g, s0.b, s0.a, s1.r, s1.g];
    const samples = LAYERS.map((_, i) => {
      const near = wp.mul(scales[i]);
      const a = texture(albedo, near).depth(int(i));
      const b = texture(data, near).depth(int(i));
      const af = texture(albedo, wp.mul(scales[i] * 0.173)).depth(int(i));
      return { a, b, rgb: mix(a.rgb, af.rgb, farMix.mul(0.65)).mul(tints[i]) };
    });
    // Height-blended weights: pebbles poke through mud rather than fading into it.
    type N = any;
    const hs: N[] = samples.map((p, i) => p.a.a.mul(0.55).add(weights[i].mul(1.5)).mul(weights[i].mul(6).clamp(0, 1)));
    let top: N = hs[0];
    for (let i = 1; i < hs.length; i++) top = max(top, hs[i]);
    const cut = top.sub(0.22);
    const bw = hs.map((h) => max(h.sub(cut), 0.0));
    let sum: N = float(0.0001);
    for (const v of bw) sum = sum.add(v);

    let rgb: N = vec3(0);
    let nx: N = float(0), ny: N = float(0), rough: N = float(0), occ: N = float(0);
    samples.forEach((p, i) => {
      const k = bw[i].div(sum);
      rgb = rgb.add(p.rgb.mul(k));
      nx = nx.add(p.b.r.mul(2).sub(1).mul(k));
      ny = ny.add(p.b.g.mul(2).sub(1).mul(k));
      rough = rough.add(p.b.b.mul(k));
      occ = occ.add(p.b.a.mul(k));
    });
    // Macro brightness drift hides repetition across the kilometre scale.
    const macro = texture(albedo, wp.mul(0.0173)).depth(int(0)).g;
    rgb = rgb.mul(mix(float(0.72), float(1.22), macro));
    const wet = clamp(s1.b.mul(1.25).sub(0.32).add(this.rain.mul(0.7)), 0, 1);
    rgb = rgb.mul(mix(float(1), float(0.56), wet));
    rough = mix(rough, rough.mul(0.42), wet);

    const baseN = texture(normalTex, uv).rgb.mul(2).sub(1);
    mat.colorNode = rgb;
    mat.roughnessNode = rough.clamp(0.04, 1);
    mat.aoNode = occ.mul(float(1).sub(texture(density, uv).b.mul(0.82)));
    mat.metalnessNode = float(0);
    mat.normalNode = transformNormalToView(normalize(vec3(baseN.x.add(nx.mul(0.8)), baseN.y, baseN.z.sub(ny.mul(0.8)))));
    mat.maskNode = texture(hole, uv).r.lessThan(0.5);

    LOD_QUADS.forEach((q, lod) => {
      const mesh = new THREE.Mesh(patchGeometry(q, 256), mat);
      mesh.frustumCulled = false;
      mesh.castShadow = lod === 1 || lod === 2;
      mesh.receiveShadow = true;
      mesh.renderOrder = 10; // after near objects, to lean on early-Z
      this.meshes.push(mesh);
      this.group.add(mesh);
    });
  }

  update(camera: THREE.PerspectiveCamera) {
    this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m);
    const counts = [0, 0, 0, 0];
    const w = this.world;
    for (let j = 0; j < WORLD_SIZE / PATCH; j++) for (let i = 0; i < WORLD_SIZE / PATCH; i++) {
      const x0 = i * PATCH - HALF_WORLD, z0 = j * PATCH - HALF_WORLD;
      const cx = x0 + PATCH / 2, cz = z0 + PATCH / 2;
      const d = Math.hypot(cx - camera.position.x, cz - camera.position.z, w.heightAt(cx, cz) - camera.position.y);
      this.box.min.set(x0, 0, z0); this.box.max.set(x0 + PATCH, 520, z0 + PATCH);
      if (d > PATCH && !this.frustum.intersectsBox(this.box)) continue;
      const lod = d < 170 ? 0 : d < 380 ? 1 : d < 800 ? 2 : 3;
      const g = this.meshes[lod].geometry as THREE.InstancedBufferGeometry;
      (g.getAttribute('iPatch') as THREE.InstancedBufferAttribute).setXYZ(counts[lod]++, x0, z0, PATCH);
    }
    this.meshes.forEach((m, l) => {
      const g = m.geometry as THREE.InstancedBufferGeometry;
      g.instanceCount = counts[l];
      g.getAttribute('iPatch').needsUpdate = true;
      m.visible = counts[l] > 0;
    });
  }
}
