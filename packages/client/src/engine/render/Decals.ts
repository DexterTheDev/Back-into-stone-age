/** Marks on the ground the story needs: the giant footprint and the drag furrows. */
import * as THREE from 'three/webgpu';
import { float, normalize, texture, transformNormalToView, uv, vec3 } from 'three/tsl';
import { loadTexture } from '../assets.ts';
import type { WorldData } from '../world.ts';

type Height = (u: number, v: number) => number;

/** Builds albedo-darkening, normal and wetness from a height function. */
function bakeRelief(size: number, h: Height, wetBelow: number) {
  const hmap = new Float32Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) hmap[j * size + i] = h(i / size, j / size);
  const data = new Uint8Array(size * size * 4), nrm = new Uint8Array(size * size * 4);
  for (let j = 1; j < size - 1; j++) for (let i = 1; i < size - 1; i++) {
    const id = j * size + i, v = hmap[id];
    const dx = hmap[id + 1] - hmap[id - 1], dy = hmap[id + size] - hmap[id - size];
    const k = 7, l = Math.hypot(dx * k, dy * k, 1);
    const o = id * 4;
    nrm[o] = ((-dx * k / l) * 0.5 + 0.5) * 255; nrm[o + 1] = ((-dy * k / l) * 0.5 + 0.5) * 255; nrm[o + 2] = (1 / l) * 0.5 * 255 + 127; nrm[o + 3] = 255;
    const rim = Math.min(1, Math.min(i, j, size - 1 - i, size - 1 - j) / (size * 0.12));
    data[o] = Math.max(0, Math.min(255, 150 + v * 220)); // brightness
    data[o + 1] = v < wetBelow ? 255 : 0; // standing water
    data[o + 2] = 0; data[o + 3] = 255 * Math.min(1, rim * (0.25 + Math.min(1, Math.abs(v) * 4)));
  }
  const make = (d: Uint8Array) => { const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat, THREE.UnsignedByteType); t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t; };
  return { mask: make(data), normal: make(nrm) };
}

const blob = (u: number, v: number, cu: number, cv: number, ru: number, rv: number, rot: number) => {
  const c = Math.cos(rot), s = Math.sin(rot), x = (u - cu) * c + (v - cv) * s, y = -(u - cu) * s + (v - cv) * c;
  const q = (x / ru) ** 2 + (y / rv) ** 2;
  return q >= 1 ? 0 : (1 - q) ** 1.4;
};

const printHeight: Height = (u, v) => {
  const toes = Math.max(blob(u, v, 0.5, 0.27, 0.1, 0.24, 0), blob(u, v, 0.29, 0.38, 0.09, 0.22, 0.48), blob(u, v, 0.71, 0.38, 0.09, 0.22, -0.48));
  const pad = blob(u, v, 0.5, 0.62, 0.2, 0.2, 0);
  const claw = Math.max(blob(u, v, 0.5, 0.05, 0.022, 0.07, 0), blob(u, v, 0.17, 0.16, 0.02, 0.07, 0.48), blob(u, v, 0.83, 0.16, 0.02, 0.07, -0.48));
  // Toes run into the pad as one pressed-down shape, not separate cups.
  const web = blob(u, v, 0.5, 0.46, 0.2, 0.17, 0);
  const d = Math.max(Math.sqrt(toes), Math.sqrt(pad), Math.sqrt(web) * 0.82, claw);
  // Mud squeezed up around the edge of the print.
  const rim = 0.26 * Math.exp(-((d - 0.03) ** 2) / 0.003);
  return -d * 0.62 + rim - 0.05 * Math.sin(u * 40 + v * 13) * d;
};

const dragHeight: Height = (u, v) => {
  const wob = 0.018 * Math.sin(v * 13);
  const a = Math.exp(-((u - 0.38 - wob) ** 2) / 0.0011), b = Math.exp(-((u - 0.62 - wob) ** 2) / 0.0011);
  return -(a + b) * 0.5 * Math.min(1, v * 7) * Math.min(1, (1 - v) * 7);
};

export class Decals {
  private made: THREE.Mesh[] = [];
  constructor(private world: WorldData, private scene: THREE.Scene) {}

  dispose() { for (const m of this.made) { this.scene.remove(m); m.geometry.dispose(); } this.made = []; }

  async init() {
    const mud = await loadTexture('tex/t_mud_a.jpg', true);
    const silt = await loadTexture('tex/c_floor_a.jpg', true);
    const fp = this.world.meta.props.find((p) => p.id === 'footprint');
    if (fp) {
      const r = bakeRelief(512, printHeight, -0.56);
      const m = this.drape(fp.x, fp.z, fp.yaw, 3.6, 4.2, r, mud, 0.05, true);
      this.scene.add(m); this.made.push(m);
    }
    const dm = this.world.meta.props.find((p) => p.id === 'dragmarks');
    if (dm) {
      const r = bakeRelief(256, dragHeight, -9);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 7, 1, 1).rotateX(-Math.PI / 2), this.material(r, silt, false));
      m.position.set(dm.x, dm.y + 0.06, dm.z); m.rotation.y = dm.yaw; m.renderOrder = 3;
      this.scene.add(m); this.made.push(m);
    }
  }

  private material(r: { mask: THREE.Texture; normal: THREE.Texture }, base: THREE.Texture, wet: boolean) {
    const mat = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false });
    const m = texture(r.mask, uv()) as any;
    const n = (texture(r.normal, uv()) as any).rgb.mul(2).sub(1);
    const tone = m.r.mul(1.25);
    const tint = (texture(base, uv().mul(3)) as any).rgb.mul(tone).mul(vec3(0.62, 0.58, 0.52));
    mat.colorNode = wet ? tint.mul(float(1).sub(m.g.mul(0.5))) : tint;
    mat.roughnessNode = wet ? float(0.72).sub(m.g.mul(0.42)) : float(0.9);
    mat.metalnessNode = float(0);
    mat.normalNode = transformNormalToView(normalize(vec3(n.x, n.z, n.y.negate())));
    mat.opacityNode = m.a;
    return mat;
  }

  private drape(x: number, z: number, yaw: number, w: number, d: number, r: { mask: THREE.Texture; normal: THREE.Texture }, base: THREE.Texture, lift: number, wet: boolean) {
    const geo = new THREE.PlaneGeometry(w, d, 22, 28).rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), lz = pos.getZ(i);
      const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
      pos.setXYZ(i, wx, this.world.heightAt(wx, wz) + lift, wz);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.material(r, base, wet));
    mesh.renderOrder = 3; mesh.receiveShadow = true; mesh.frustumCulled = false;
    return mesh;
  }
}
