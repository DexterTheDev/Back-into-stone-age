/** Campfires: flame sheets, embers, smoke, flickering light. */
import * as THREE from 'three/webgpu';
import { uv, time, float, vec2, vec3, mix, smoothstep, pow, sin, mx_fractal_noise_float, uniform, positionLocal, abs, clamp, vec4 } from 'three/tsl';
import { loadGLB } from '../assets.ts';
import { LAYER_FIRE_SHADOW } from './Stage.ts';

interface Fire { id: number; root: THREE.Group; light: THREE.PointLight; flames: THREE.Mesh[]; lit: boolean; level: { value: number }; seed: number }

/** Rising flame on a quad. `level` exposes the brightness uniform through `.node`. */
export function flameMaterial(level: { value: number }, seed: number) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const lv = uniform(1);
  (level as { node?: unknown }).node = lv;
  const u = uv();
  const rise = time.mul(1.55).add(seed);
  const n = mx_fractal_noise_float(vec3(u.x.mul(2.6).add(seed), u.y.mul(2.2).sub(rise), time.mul(0.35)), 3, 2, 0.5).add(0.5);
  const shape = smoothstep(0.92, 0.1, abs(u.x.sub(0.5)).mul(2).add(u.y.mul(u.y).mul(0.95)));
  const body = clamp(shape.mul(n.mul(1.7)).sub(u.y.mul(0.72)), 0, 1).mul(lv);
  const col = mix(mix(vec3(1.4, 0.16, 0.02), vec3(3.4, 1.05, 0.14), smoothstep(0.1, 0.5, body)), vec3(7.5, 4.8, 1.8), smoothstep(0.5, 0.95, body));
  mat.colorNode = col;
  mat.opacityNode = smoothstep(0.03, 0.34, body);
  void pow; void sin; void float; void vec2; void positionLocal; void vec4;
  return mat;
}

export class Fires {
  group = new THREE.Group();
  private list = new Map<number, Fire>();
  private pit: THREE.Object3D | null = null;
  private wood: THREE.BufferGeometry | null = null;
  private woodMat: THREE.Material | null = null;
  private lights = 0;

  async init() {
    const g = await loadGLB('stone_fire_pit');
    this.pit = g.scene;
    const b = await loadGLB('dry_branches_medium_01');
    b.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !this.wood) { this.wood = m.geometry; this.woodMat = m.material as THREE.Material; } });
  }

  clear() { for (const f of this.list.values()) this.group.remove(f.root); this.list.clear(); this.lights = 0; }

  setFire(id: number, x: number, y: number, z: number, lit: boolean) {
    let f = this.list.get(id);
    if (!f) {
      const root = new THREE.Group();
      root.position.set(x, y, z);
      if (this.pit) { const p = this.pit.clone(); p.scale.setScalar(0.72); root.add(p); }
      if (this.wood) for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(this.wood, this.woodMat!); m.rotation.set(0.5, i * 1.57, 0.2); m.position.y = 0.16; m.scale.setScalar(0.34); m.castShadow = true; root.add(m); }
      const level = { value: 1 };
      const seed = id * 3.17;
      const flames: THREE.Mesh[] = [];
      const mat = flameMaterial(level, seed);
      for (let i = 0; i < 3; i++) {
        const q = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), mat);
        q.position.y = 0.72; q.rotation.y = i * 1.05;
        root.add(q); flames.push(q);
      }
      const light = new THREE.PointLight(0xff8a3c, 0, 26, 1.8);
      light.position.set(0, 0.8, 0);
      if (this.lights < 2) { light.castShadow = true; light.shadow.mapSize.setScalar(512); light.shadow.bias = -0.002; light.shadow.camera.near = 0.2; light.shadow.camera.far = 26; light.shadow.camera.layers.set(LAYER_FIRE_SHADOW); this.lights++; }
      root.add(light);
      this.group.add(root);
      f = { id, root, light, flames, lit, level, seed };
      this.list.set(id, f);
    }
    f.lit = lit;
    for (const q of f.flames) q.visible = lit;
  }

  update(fuel: Map<number, number>, now: number) {
    for (const f of this.list.values()) {
      const lv = fuel.get(f.id) ?? 1;
      const k = 0.4 + 0.6 * Math.min(1, lv * 2.2);
      const node = (f.level as { node?: { value: number } }).node;
      if (node) node.value = k;
      const t = now * 0.001 + f.seed;
      const flick = 0.78 + 0.16 * Math.sin(t * 9.1) * Math.sin(t * 3.7) + 0.1 * Math.sin(t * 23);
      f.light.intensity = f.lit ? 340 * k * flick : 0;
      f.light.position.x = Math.sin(t * 7) * 0.08; f.light.position.z = Math.cos(t * 5.3) * 0.08;
    }
  }
}
