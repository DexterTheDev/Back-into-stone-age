/** River surface and the flooded tunnel: scrolling normals, depth tint, sky reflection. */
import * as THREE from 'three/webgpu';
import { texture, uv, vec2, vec3, float, time, normalize, mix, transformNormalToView, positionWorld, cameraPosition, dot, pow, max, length, smoothstep, attribute } from 'three/tsl';
import type { WorldData } from '../world.ts';

function waterNormals(size: number) {
  const data = new Uint8Array(size * size * 4);
  const h = new Float32Array(size * size);
  const TAU = Math.PI * 2;
  const waves: [number, number, number, number][] = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 26; i++) { const fx = Math.floor(rnd() * 13) - 6, fy = Math.floor(rnd() * 13) - 6; waves.push([fx, fy, rnd() * TAU, 1 / (1 + Math.hypot(fx, fy))]); }
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let v = 0;
    for (const [fx, fy, ph, a] of waves) v += a * Math.sin(((fx * i + fy * j) / size) * TAU + ph);
    h[j * size + i] = v;
  }
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const l = h[j * size + ((i + size - 1) % size)], r = h[j * size + ((i + 1) % size)], d = h[((j + size - 1) % size) * size + i], u = h[((j + 1) % size) * size + i];
    const nx = (l - r) * 2.4, ny = (d - u) * 2.4, nz = 1, len = Math.hypot(nx, ny, nz), o = (j * size + i) * 4;
    data[o] = ((nx / len) * 0.5 + 0.5) * 255; data[o + 1] = ((ny / len) * 0.5 + 0.5) * 255; data[o + 2] = ((nz / len) * 0.5 + 0.5) * 255; data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

export class Water {
  group = new THREE.Group();
  private pool: THREE.Mesh | null = null;
  private poolY = 0;
  /** Flash rain fills the side tunnels. */
  setFlood(rain: number) { if (this.pool) this.pool.position.y += (this.poolY + Math.max(0, rain - 0.3) * 1.5 - this.pool.position.y) * 0.02; }

  constructor(private world: WorldData) {}

  init() {
    const river = this.world.meta.river;
    const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
    let along = 0;
    const across = 8;
    for (let i = 0; i < river.length; i++) {
      const p = river[i], a = river[Math.max(i - 1, 0)], b = river[Math.min(i + 1, river.length - 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      if (i > 0) along += Math.hypot(p.x - a.x, p.z - a.z);
      const w = p.w + 7;
      for (let k = 0; k <= across; k++) {
        const t = k / across * 2 - 1;
        pos.push(p.x + nx * w * t, p.y, p.z + nz * w * t);
        uvs.push(t * w, along);
      }
      if (i > 0) {
        const r = (i - 1) * (across + 1);
        for (let k = 0; k < across; k++) { const q = r + k; idx.push(q, q + 1, q + across + 1, q + 1, q + across + 2, q + across + 1); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const tex = waterNormals(256);
    const mk = (flow: number, tint: THREE.Color, opacity: number) => {
      const mat = new THREE.MeshPhysicalNodeMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
      const n1 = texture(tex, uv().mul(0.075).add(vec2(0.012, -0.05 * flow).mul(time))).xyz.mul(2).sub(1);
      const n2 = texture(tex, uv().mul(0.21).add(vec2(-0.02, -0.11 * flow).mul(time))).xyz.mul(2).sub(1);
      const n3 = texture(tex, uv().mul(0.61).add(vec2(0.03, -0.2 * flow).mul(time))).xyz.mul(2).sub(1);
      const nrm = normalize(vec3(n1.x.add(n2.x).add(n3.x.mul(0.5)).mul(0.24), 1, n1.y.add(n2.y).add(n3.y.mul(0.5)).mul(0.24)));
      mat.normalNode = transformNormalToView(nrm);
      const toCam = normalize(cameraPosition.sub(positionWorld));
      const fres = pow(float(1).sub(max(dot(nrm, toCam), 0)), 4).mul(0.96).add(0.04);
      const edge = smoothstep(0, 5, length(attribute('uv', 'vec2').x.abs().sub(0)));
      mat.colorNode = vec3(tint.r, tint.g, tint.b);
      mat.roughnessNode = float(0.09);
      mat.metalnessNode = float(0);
      mat.specularIntensityNode = float(0.5);
      mat.opacityNode = mix(float(opacity), float(0.97), fres);
      void edge;
      return mat;
    };
    const mesh = new THREE.Mesh(geo, mk(1, new THREE.Color(0.012, 0.026, 0.02), 0.74));
    mesh.receiveShadow = false;
    mesh.renderOrder = 5;
    this.group.add(mesh);

    // Flooded side tunnel: still black water.
    const y = this.world.meta.tunnelWaterY;
    const m = this.world.meta.mouth;
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(120, 150).rotateX(-Math.PI / 2), mk(0.08, new THREE.Color(0.006, 0.01, 0.011), 0.82));
    pool.geometry.setAttribute('uv', pool.geometry.getAttribute('uv').clone());
    const uvA = pool.geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * 60, uvA.getY(i) * 75);
    pool.position.set(m.x - 24, y, m.z + 75);
    pool.renderOrder = 5;
    this.pool = pool; this.poolY = y;
    this.group.add(pool);
    // Warm pools: milky, and steaming a little on a cold morning.
    for (const p of this.world.meta.pools ?? []) {
      const g = new THREE.CircleGeometry(p.r + 1, 40).rotateX(-Math.PI / 2);
      const u = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * p.r, u.getY(i) * p.r);
      const m = new THREE.Mesh(g, mk(0.06, new THREE.Color(0.1, 0.16, 0.13), 0.86));
      m.position.set(p.x, p.y, p.z); m.renderOrder = 5;
      this.group.add(m);
    }
  }
}
