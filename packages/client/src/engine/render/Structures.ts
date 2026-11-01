/** Everything the players raise with their own hands, stage by stage, plus what others built before them. */
import * as THREE from 'three/webgpu';
import { uniform, uv, vec3, float, time, smoothstep, length, sin, mix, mx_fractal_noise_float } from 'three/tsl';
import { loadGLB, loadTexture } from '../assets.ts';
import type { WorldData } from '../world.ts';

type V3 = [number, number, number];

/** A pale, slightly crooked length of wood from a to b. */
function makeLog(a: V3, b: V3, r: number, mat: THREE.Material, seed = 1) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r * 0.86, r, len, 8, 4);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const v = p.getY(i) / len;
    p.setXYZ(i, p.getX(i) + Math.sin(v * 5 + seed) * r * 0.22, p.getY(i), p.getZ(i) + Math.cos(v * 4 + seed * 2) * r * 0.22);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

interface Mats { wood: THREE.Material; rope: THREE.Material; moss: THREE.Material; mud: THREE.Material; rock: THREE.Material; clay: THREE.Material; plank: THREE.Material; copper: THREE.MeshStandardMaterial; face: THREE.Material }

export class Structures {
  group = new THREE.Group();
  private mats!: Mats;
  private rock: THREE.BufferGeometry | null = null;
  private built = new Map<string, { root: THREE.Group; stage: number }>();
  private doorPanel: THREE.Group | null = null;
  private doorOpen = 0;
  private doorWant = 0;
  private era = false;
  private eraGroup = new THREE.Group();
  private built0 = new THREE.Group();
  private rift: THREE.Mesh | null = null;
  private riftLevel = uniform(0);
  private riftLight = new THREE.PointLight(0xc9e8ff, 0, 60, 1.5);
  private raftRide: THREE.Group | null = null;

  constructor(private world: WorldData) {}

  private feat(id: string) { return this.world.meta.features[id]; }

  async init() {
    const [bark, barkN, cord, moss, mud, gravel, clay, lime, limeN] = await Promise.all([
      loadTexture('tex/b_pine_a.jpg', true), loadTexture('tex/b_pine_n.jpg', false), loadTexture('tex/b_palm_a.jpg', true),
      loadTexture('tex/t_moss_a.jpg', true), loadTexture('tex/t_mud_a.jpg', true), loadTexture('tex/t_rock_a.jpg', true), loadTexture('tex/t_sand_a.jpg', true),
      loadTexture('tex/c_lime_a.jpg', true), loadTexture('tex/c_lime_n.jpg', false),
    ]);
    for (const t of [moss, mud, gravel, clay]) t.repeat.set(3, 3);
    lime.repeat.set(2.4, 2); limeN.repeat.copy(lime.repeat);
    this.mats = {
      wood: new THREE.MeshStandardMaterial({ map: bark, normalMap: barkN, roughness: 0.94, color: 0x93897a }),
      rope: new THREE.MeshStandardMaterial({ map: cord, roughness: 1, color: 0xb9a57c }),
      moss: new THREE.MeshStandardMaterial({ map: moss, roughness: 1, color: 0x8ea06f }),
      mud: new THREE.MeshStandardMaterial({ map: mud, roughness: 0.95, color: 0x7a6d5e }),
      rock: new THREE.MeshStandardMaterial({ map: gravel, roughness: 0.95, color: 0x9b958a }),
      clay: new THREE.MeshStandardMaterial({ map: clay, roughness: 0.9, color: 0x9d7f64 }),
      plank: new THREE.MeshStandardMaterial({ map: bark, normalMap: barkN, roughness: 0.92, color: 0x6e6658 }),
      copper: new THREE.MeshStandardMaterial({ color: 0xb06a3a, metalness: 0.85, roughness: 0.35 }),
      // Plastered to match the limestone it hides in.
      face: new THREE.MeshStandardMaterial({ map: lime, normalMap: limeN, roughness: 0.92, color: 0xa2998b }),
    };
    const rk = await loadGLB('rock_07');
    rk.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !this.rock && !/_lod[12]/.test(o.name)) this.rock = m.geometry; });
    this.group.add(this.built0, this.eraGroup);
    this.eraGroup.visible = false;
    this.buildCanopy();
    this.buildEra();
    this.buildRift();
    this.raftRide = this.raft();
    this.raftRide.visible = false;
    this.group.add(this.raftRide);
  }

  private stone(x: number, y: number, z: number, s: number, seed: number) {
    const m = new THREE.Mesh(this.rock ?? new THREE.IcosahedronGeometry(1, 2), this.mats.rock);
    m.position.set(x, y, z); m.scale.setScalar(s * (this.rock ? 7 : 1)); m.rotation.set(seed, seed * 2.3, seed * 0.7);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  private stakeRow(root: THREE.Group, len: number, n: number, lean = 0.5) {
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) - 0.5 : 0, z = u * len;
      root.add(makeLog([0, -0.2, z], [lean, 1.7 + (i % 3) * 0.14, z + 0.08], 0.075, this.mats.wood, i));
    }
    root.add(makeLog([-0.1, 0.5, -len / 2], [-0.1, 0.5, len / 2], 0.07, this.mats.wood, 3));
  }

  set(id: string, stage: number, open?: boolean) {
    if (id === 'door' && open !== undefined) this.doorWant = open ? 1 : 0;
    const have = this.built.get(id);
    if (have && have.stage === stage) return;
    if (have) { this.built0.remove(have.root); have.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); this.built.delete(id); }
    if (stage <= 0) return;
    const root = new THREE.Group();
    this.make(id, stage, root);
    this.built0.add(root);
    this.built.set(id, { root, stage });
  }

  setEra(on: boolean) { this.era = on; this.built0.visible = !on; this.eraGroup.visible = on; }
  setRift(level: number) { this.riftLevel.value = level; if (this.rift) this.rift.visible = level > 0.01; this.riftLight.intensity = level * 900; }
  /** Shows the raft under whoever is poling it. */
  carry(x: number, y: number, z: number, on: boolean) { if (this.raftRide) { this.raftRide.visible = on; if (on) this.raftRide.position.set(x, y - 0.45, z); } }

  update(dt: number, now: number) {
    if (this.doorPanel) {
      this.doorOpen += (this.doorWant - this.doorOpen) * Math.min(1, dt * 2.4);
      this.doorPanel.rotation.y = this.doorOpen * 1.45;
    }
    void now;
  }

  private make(id: string, stage: number, root: THREE.Group) {
    const m = this.mats;
    const at = (name: string) => { const f = this.feat(name); if (f) root.position.set(f.x, f.y, f.z); root.rotation.y = f?.yaw ?? 0; return f; };
    if (id === 'door') {
      const f = at('door'), hw = f?.hw ?? 6, h = f?.h ?? 8;
      for (const z of [-hw, hw]) root.add(makeLog([0, -0.3, z], [0, h, z], 0.2, m.wood, z));
      root.add(makeLog([0, h - 0.3, -hw - 0.3], [0, h - 0.3, hw + 0.3], 0.18, m.wood, 2));
      const panel = new THREE.Group(); panel.position.set(0, 0, -hw);
      if (stage >= 2) {
        for (let i = 0; i < 9; i++) { const z = ((i + 0.5) / 9) * hw * 2; panel.add(makeLog([0, 0.1, z], [0, h - 0.5, z], 0.05, m.wood, i)); }
        for (let j = 0; j < 8; j++) { const y = 0.3 + (j / 7) * (h - 1.1); panel.add(makeLog([0.06, y, 0], [0.06, y, hw * 2], 0.045, m.wood, j)); }
      }
      if (stage >= 3) {
        root.add(makeLog([0, h - 0.2, hw - 0.4], [1.2, 1.4, hw - 0.4], 0.018, m.rope, 1));
        root.add(this.stone(1.3, 1, hw - 0.4, 0.7, 0.4));
      }
      if (stage >= 4) {
        // Moss and mud over the lattice: from outside, nothing but rock face.
        const W = hw * 2 + 3, H = h + 1.4;
        const g = new THREE.PlaneGeometry(W, H, 44, 24);
        const p = g.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
          const a = p.getX(i), b = p.getY(i), edge = Math.min(1, (W / 2 - Math.abs(a)) / 1.6, (H / 2 - Math.abs(b)) / 1.2);
          // Bulges out of the rock in the middle and dives back into it at the edges, so no outline shows.
          p.setZ(i, (0.5 * edge - 0.5) + 0.3 * Math.sin(a * 1.1 + b * 0.7) + 0.22 * Math.sin(a * 0.5 - b * 1.3) + 0.12 * Math.sin(b * 3.1 + a));
        }
        g.computeVertexNormals();
        const skin = new THREE.Mesh(g, m.face); skin.rotation.y = Math.PI / 2; skin.position.set(0.5, h / 2 - 0.1, hw); skin.castShadow = true; skin.receiveShadow = true;
        panel.add(skin);
        const mud = new THREE.Mesh(g, m.mud); mud.rotation.y = -Math.PI / 2; mud.position.set(-0.1, h / 2 - 0.2, hw); panel.add(mud);
        // Moss runs along the foot and over the top, where water would run down real rock.
        for (let i = 0; i < 26; i++) {
          const t = i / 25, low = i % 3 !== 0, blob = new THREE.Mesh(new THREE.SphereGeometry(0.5 + ((i * 0.37) % 1) * 0.5, 8, 6), m.moss);
          blob.scale.set(0.4, 0.5, 1.5); blob.position.set(0.7, low ? 0.1 + ((i * 0.53) % 1) * 1.1 : h - 0.6 - ((i * 0.3) % 1), t * hw * 2); blob.receiveShadow = true;
          panel.add(blob);
        }
        for (let i = 0; i < 12; i++) panel.add(this.stone(0.75, 0.2 + ((i * 0.37) % 1) * 1.6, ((i * 0.61) % 1) * hw * 2, 0.16 + ((i * 0.53) % 1) * 0.16, i));
      }
      root.add(panel);
      this.doorPanel = panel;
      return;
    }
    if (id === 'seal') {
      at('seal');
      for (let i = 0; i < 7; i++) { const z = -3 + i; root.add(makeLog([0.1 * (i % 2), -0.3, z], [0.1 * ((i + 1) % 2), 4.2, z + 0.2], 0.1, m.wood, i)); }
      root.add(makeLog([0.2, 1.2, -4], [0.2, 1.3, 4], 0.09, m.wood, 8));
      if (stage >= 2) {
        const g = new THREE.BoxGeometry(0.6, 4.4, 9, 2, 12, 24), p = g.getAttribute('position');
        for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + 0.2 * Math.sin(p.getY(i) * 2.1 + p.getZ(i)));
        g.computeVertexNormals();
        const w = new THREE.Mesh(g, m.clay); w.position.set(-0.3, 1.9, 0); w.castShadow = true; root.add(w);
        for (let i = 0; i < 14; i++) root.add(this.stone(-0.5, 0.2 + ((i * 0.31) % 1) * 3.8, -3.5 + ((i * 0.57) % 1) * 7, 0.28, i));
      } else {
        // Half gone: the poles are all that is left.
        root.rotation.z = 0.06;
      }
      return;
    }
    if (id === 'lookout') {
      at('lookout');
      for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) root.add(makeLog([x, -0.3, z], [x * 0.8, 3.6, z * 0.8], 0.09, m.wood, x + z));
      for (let i = 0; i < 8; i++) root.add(makeLog([-1.3, 3.5, -1.3 + i * 0.37], [1.3, 3.5, -1.3 + i * 0.37], 0.07, m.wood, i));
      for (let i = 0; i < 7; i++) root.add(makeLog([-1.3, 0.5 + i * 0.5, 1.3], [-0.6, 0.5 + i * 0.5, 1.5], 0.035, m.wood, i));
      return;
    }
    if (id === 'weir') {
      at('weir');
      for (let i = 0; i < 16; i++) { const a = -1 + (i / 15) * 2; root.add(this.stone(Math.sin(a) * 6, 0.1, Math.cos(a) * 6 - 6, 0.3, i)); }
      return;
    }
    if (id === 'raft') {
      const f = at('raft_site'); void f;
      const r = this.raft(stage >= 2); root.add(r);
      const land = this.feat('raft_land');
      if (land && stage >= 3) { const b = this.raft(true); b.position.set(land.x - root.position.x, land.y - root.position.y, land.z - root.position.z); root.add(b); }
      return;
    }
    if (id === 'fwd_ring' || id === 'hot_ring' || id === 'summit_ring') { at(id); for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283; root.add(this.stone(Math.cos(a) * 1.3, 0.05, Math.sin(a) * 1.3, 0.2, i)); } return; }
    if (id === 'fwd_barricade' || id.startsWith('barricade')) { at(id); this.stakeRow(root, 8, 11); return; }
    if (id === 'fwd_hollow') {
      at(id);
      for (let i = 0; i < 6; i++) root.add(makeLog([-1.6 + i * 0.64, 0, -1.2], [-1.6 + i * 0.64, 1.4, 1], 0.06, m.wood, i));
      const c = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.8, 6, 6), m.moss); c.rotation.x = -0.95; c.position.set(0, 0.75, -0.1); root.add(c);
      return;
    }
    if (id === 'garden') { at(id); for (let i = 0; i < 10; i++) root.add(this.stone(-2 + (i % 5), 0, (i < 5 ? -1 : 1), 0.1, i)); const b = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), m.moss); b.rotation.x = -Math.PI / 2; b.position.y = 0.06; root.add(b); return; }
    if (id === 'furnace') {
      at(id);
      const g = new THREE.SphereGeometry(1.2, 14, 10, 0, 6.283, 0, 2.2); g.scale(1, 1.3, 1);
      const body = new THREE.Mesh(g, m.clay); body.position.y = 0.9; body.castShadow = true; root.add(body);
      // Bloom carries the glow. A new real light would stall every shader in the scene.
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 3.2, 0.7) })); glow.position.set(0, 1.1, 1.17); root.add(glow);
      return;
    }
    if (id === 'mast') {
      at(id);
      root.add(makeLog([0, -1, 0], [0, 26, 0], 0.32, m.wood, 2));
      root.add(makeLog([0, 25.5, 0], [0, 28, 0], 0.03, m.copper, 2));
      for (const a of [0.5, 2.6, 4.7]) root.add(makeLog([0, 20, 0], [Math.cos(a) * 12, 0, Math.sin(a) * 12], 0.025, m.rope, a));
      return;
    }
    if (id === 'array_ring') {
      at('array');
      const R = 7.2;
      if (stage >= 1) for (let i = 0; i < 4; i++) {
        const a = (i / 4) * 6.283 + 0.4;
        const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), new THREE.MeshStandardMaterial({ color: 0x0c0c12, emissive: new THREE.Color(0.2, 0.5, 1), emissiveIntensity: 2.5, roughness: 0.2 }));
        s.scale.y = 1.8; s.position.set(Math.cos(a) * R, 1.7, Math.sin(a) * R); root.add(s);
      }
      if (stage >= 2) for (let k = 0; k < 3; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(R, 0.022, 6, 96), m.copper); t.rotation.x = Math.PI / 2; t.position.y = 1.4 + k * 0.16; root.add(t); }
      if (stage >= 3) { const f = this.feat('mast'), r = this.feat('array'); if (f && r) root.add(makeLog([0, 1.5, 0], [f.x - r.x, 18, f.z - r.z], 0.018, m.copper, 1)); }
      return;
    }
    if (id === 'ground') { at(id); root.add(makeLog([0, -0.4, 0], [0.1, 0.9, 0], 0.05, m.copper, 1)); return; }
    if (id.startsWith('trap_')) { at(id); root.add(makeLog([0, 0, 0], [0.4, 1.5, 0], 0.03, m.wood, 1)); root.add(makeLog([0.4, 1.5, 0], [-0.6, 0.1, 0.6], 0.008, m.rope, 2)); return; }
  }

  private raft(pole = true) {
    const r = new THREE.Group(), m = this.mats;
    for (let i = 0; i < 8; i++) r.add(makeLog([-1.6 + i * 0.46, 0, -2.6], [-1.6 + i * 0.46, 0, 2.6], 0.2, m.wood, i));
    for (const z of [-1.9, 1.9]) r.add(makeLog([-1.8, 0.14, z], [1.8, 0.14, z], 0.08, m.wood, z));
    if (pole) r.add(makeLog([1.2, 0.2, 0], [2.2, 3.2, 1], 0.05, m.wood, 3));
    return r;
  }

  /** Calloway's platforms, ladder and walkways. */
  private buildCanopy() {
    const m = this.mats, list = this.world.meta.platforms ?? [];
    for (const p of list) {
      const n = Math.max(3, Math.round(p.hx * 2 / 0.3));
      const deck = new THREE.Group(); deck.position.set(p.x, p.y, p.z); deck.rotation.y = p.yaw ?? 0;
      for (let i = 0; i < n; i++) { const x = -p.hx + (i + 0.5) * ((p.hx * 2) / n); deck.add(makeLog([x, p.hy, -p.hz], [x, p.hy, p.hz], 0.13, m.plank, i)); }
      for (const s of [-1, 1]) deck.add(makeLog([-p.hx, p.hy + 0.9, s * p.hz], [p.hx, p.hy + 0.9, s * p.hz], 0.02, m.rope, s));
      this.group.add(deck);
    }
    const a = this.feat('ladder'), b = this.feat('ladder_top');
    if (a && b) {
      for (const s of [-0.26, 0.26]) this.group.add(makeLog([a.x + s, a.y, a.z], [a.x + s, b.y, a.z], 0.02, m.rope, s));
      for (let y = a.y + 0.4; y < b.y; y += 0.42) this.group.add(makeLog([a.x - 0.26, y, a.z], [a.x + 0.26, y, a.z], 0.024, m.wood, y));
    }
  }

  /** 1969: work lights on tripods where the Array stood. */
  private buildEra() {
    const f = this.feat('array');
    if (!f) return;
    for (const [dx, dz] of [[7, 2], [15, 9]] as const) {
      const g = new THREE.Group(); g.position.set(f.x + dx, f.y, f.z + dz);
      for (const a of [0, 2.1, 4.2]) g.add(makeLog([Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], [0, 2, 0], 0.02, this.mats.copper, a));
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 6, 4) })); lamp.position.y = 2.1; g.add(lamp);
      this.eraGroup.add(g);
    }
  }

  private buildRift() {
    const f = this.feat('rift');
    if (!f) return;
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const c = uv().sub(0.5).mul(2);
    const r = length(c);
    const n = mx_fractal_noise_float(vec3(c.mul(3), time.mul(0.8)), 3, 2, 0.5);
    const edge = float(1).sub(r.add(n.mul(0.22))).clamp(0, 1);
    const body = smoothstep(0.08, 0.7, edge);
    mat.colorNode = mix(vec3(0.3, 0.6, 1.3), vec3(4.5, 5, 6), body).mul(float(0.8).add(sin(time.mul(14)).mul(0.2)));
    mat.opacityNode = smoothstep(0, 0.3, edge).mul(this.riftLevel);
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 56), mat);
    m.scale.set(3.1, 4.4, 1);
    m.position.set(f.x, f.y + 4.2, f.z); m.rotation.y = f.yaw ?? 0; m.visible = false; m.renderOrder = 8;
    this.rift = m;
    this.riftLight.position.set(f.x, f.y + 4, f.z);
    this.group.add(m, this.riftLight);
  }
}
