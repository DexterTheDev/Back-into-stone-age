/** Story objects and gatherable resources. */
import * as THREE from 'three/webgpu';
import { PROPS, type PropShape, type ResourceNode, type StoryProp } from '@dino/shared';
import { loadGLB, loadTexture } from '../assets.ts';
import type { WorldData } from '../world.ts';

/**
 * Variants in a scan set differ wildly in size, so `scale` is the largest side of each in metres. A true
 * 10 cm pebble is invisible from eye height, so anything you need to find is sized to be found.
 * `look` restyles a scan so one resource never reads as another at a few metres.
 */
const NODE_MODEL: Record<string, { file: string; scale: number; tall?: number; clump?: number; look?: { color: [number, number, number]; roughness: number; plain?: boolean } }> = {
  // Knappable flint: slate blue and glassy, so it stands out from the dull river stones.
  flint: { file: 'namaqualand_stones_01', scale: 0.3, look: { color: [0.075, 0.08, 0.095], roughness: 0.3, plain: true } },
  branch: { file: 'dry_branches_medium_01', scale: 1.7 },
  fiber: { file: 'nettle_plant', scale: 1, clump: 4 },
  tinder: { file: 'wild_rooibos_bush', scale: 1.5, clump: 2, look: { color: [1, 0.78, 0.5], roughness: 0.95 } },
  // Wet river clay: a slick pale bank, not a rock.
  clay: { file: 'sand_rocks_small_01', scale: 0.28, tall: 1.8, look: { color: [0.13, 0.125, 0.115], roughness: 0.3, plain: true } },
  stone: { file: 'rock_07', scale: 0.1 },
  moss: { file: 'weed_plant_02', scale: 0.7, clump: 3, look: { color: [0.26, 0.42, 0.16], roughness: 0.9 } },
  bark: { file: 'tree_stump_01', scale: 0.55, look: { color: [0.32, 0.22, 0.14], roughness: 0.95 } },
  reed: { file: 'weed_plant_02', scale: 1.2, clump: 3, look: { color: [0.5, 0.5, 0.24], roughness: 0.9 } },
  bone: { file: 'dead_tree_trunk_02', scale: 0.32, look: { color: [0.86, 0.82, 0.7], roughness: 0.75, plain: true } },
  // Brassy flecks in dark rock.
  pyrite: { file: 'namaqualand_stones_01', scale: 0.34, look: { color: [0.62, 0.5, 0.2], roughness: 0.28, plain: true } },
  // Green crust on red metal.
  copper: { file: 'namaqualand_stones_01', scale: 0.4, look: { color: [0.18, 0.42, 0.3], roughness: 0.4, plain: true } },
};

/** Scan sets hold several separate objects in one file: each becomes a variant. */
const VARIANTS = /namaqualand|rooibos|nettle|dry_branches/;

/** Canvas images for anything with writing on it. */
function ink(draw: (g: OffscreenCanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 256) {
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d')!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const paper = (g: OffscreenCanvasRenderingContext2D, w: number, h: number, base = '#c9bc9a') => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(40,30,20,.55)'; for (let y = 20; y < h - 10; y += 14) { g.beginPath(); g.moveTo(12, y + Math.sin(y) * 2); g.lineTo(w - 14 - (y * 7) % 40, y); g.stroke(); } };

export class Props {
  group = new THREE.Group();
  nodes = new Map<number, { node: ResourceNode; obj: THREE.Object3D }>();
  props = new Map<string, { prop: StoryProp; obj: THREE.Object3D | null }>();
  private proto = new Map<string, THREE.Object3D[]>();

  constructor(private world: WorldData) {}

  private ready = false;
  private shapes: { rock: THREE.Material; bark: THREE.Material; canvas: THREE.Material; bone: THREE.Material; paper: THREE.Material; wall: THREE.Material; copper: THREE.Material; map: THREE.Material; news: THREE.Material; tally: THREE.Material; words: THREE.Material; arrow: THREE.Material } | null = null;

  private async makeShapes() {
    const [rock, bark, moss, cloth] = await Promise.all([loadTexture('tex/t_rock_a.jpg', true), loadTexture('tex/b_pine_a.jpg', true), loadTexture('tex/t_moss_a.jpg', true), loadTexture('tex/t_sand_a.jpg', true)]);
    moss.repeat.set(2, 2); cloth.repeat.set(3, 3);
    const stain = (c: number, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const arrow = ink((g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = '#2a241d'; g.lineWidth = 11; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(w * 0.86, h / 2); g.lineTo(w * 0.14, h / 2); g.moveTo(w * 0.36, h * 0.28); g.lineTo(w * 0.13, h / 2); g.lineTo(w * 0.36, h * 0.72); g.stroke();
      g.font = 'bold 46px serif'; g.fillStyle = '#2a241d'; g.fillText('A.W.', w * 0.5, h * 0.86);
    });
    this.shapes = {
      rock: new THREE.MeshStandardMaterial({ map: rock, roughness: 0.96, color: 0x9d968a }),
      bark: new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95, color: 0x82786a }),
      canvas: new THREE.MeshStandardMaterial({ map: cloth, roughness: 0.97, color: 0x8d846c, side: THREE.DoubleSide }),
      bone: stain(0xc8bfa6, 0.8),
      paper: new THREE.MeshStandardMaterial({ map: ink((g, w, h) => paper(g, w, h)), roughness: 0.9, side: THREE.DoubleSide }),
      wall: new THREE.MeshStandardMaterial({ map: moss, color: 0x6e7f52, roughness: 1, side: THREE.DoubleSide }),
      copper: new THREE.MeshStandardMaterial({ color: 0x7a4a24, metalness: 0.7, roughness: 0.5 }),
      map: new THREE.MeshStandardMaterial({ map: ink((g, w, h) => { paper(g, w, h, '#bcae8c'); g.strokeStyle = 'rgba(20,50,30,.8)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(30 + i * 24, 60 + (i * 53) % 140, 30 + i * 3, 0, 5); g.stroke(); } }), roughness: 0.9, side: THREE.DoubleSide }),
      news: new THREE.MeshStandardMaterial({ map: ink((g, w, h) => { g.fillStyle = '#d6d0c0'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a'; g.font = 'bold 24px serif'; g.fillText('INDUSTRIALIST', 24, 46); g.fillText('ABEL WHITCOMBE', 16, 76); g.fillText('MISSING', 76, 106); g.font = '11px serif'; for (let i = 0; i < 9; i++) g.fillText('Billings, Mont. — search of the Garfield County', 12, 130 + i * 13); }), roughness: 0.9, side: THREE.DoubleSide }),
      tally: new THREE.MeshStandardMaterial({ map: ink((g, w, h) => { g.fillStyle = '#4e4034'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b9a98a'; g.lineWidth = 3; for (let j = 0; j < 12; j++) for (let i = 0; i < 40; i++) { const x = 8 + i * 6.2, y = 10 + j * 20; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (i % 5 === 4 ? -20 : 1), y + 15); g.stroke(); } }), roughness: 1 }),
      words: new THREE.MeshStandardMaterial({ map: ink((g, w, h) => { g.fillStyle = '#39352d'; g.fillRect(0, 0, w, h); g.fillStyle = '#cbc3b1'; g.font = 'bold 42px serif'; g.fillText('A.W. 1938', 40, 90); g.font = 'bold 34px serif'; g.fillText("DON'T TRUST", 24, 160); g.fillText('HIM', 170, 210); }, 512, 256), roughness: 1 }),
      arrow: new THREE.MeshStandardMaterial({ map: arrow, transparent: true, roughness: 1, depthWrite: false }),
    };
  }

  /** Things no scan exists for, built from primitives. */
  private shape(kind: PropShape) {
    const m = this.shapes!, root = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; root.add(o); return o; };
    const crag = (w: number, h: number, d: number) => { const g = new THREE.IcosahedronGeometry(1, 3), p = g.getAttribute('position'); for (let i = 0; i < p.count; i++) { const k = 1 + 0.16 * Math.sin(p.getX(i) * 7 + p.getY(i) * 5) * Math.cos(p.getZ(i) * 6); p.setXYZ(i, p.getX(i) * w * k, p.getY(i) * h * k, p.getZ(i) * d * k); } g.computeVertexNormals(); return g; };
    switch (kind) {
      case 'arrow': {
        add(crag(1.1, 0.5, 0.9), m.rock, 0, 0.22, 0);
        add(new THREE.PlaneGeometry(1.5, 1.5), m.arrow, 0, 0.74, 0.02, -Math.PI / 2);
        break;
      }
      case 'page': add(new THREE.PlaneGeometry(0.3, 0.42), m.paper, 0, 0.03, 0, -Math.PI / 2, 0, 0.4); break;
      case 'marker': add(new THREE.BoxGeometry(0.46, 1, 0.06), m.bark, 0, 0.45, 0, 0.08, 0, 0.05); add(new THREE.BoxGeometry(1.1, 0.12, 2), m.canvas, 0, 0.06, 1.1); break;
      case 'tent': {
        // Rotted canvas slumped over its ridge pole.
        const g = new THREE.PlaneGeometry(5, 4.4, 20, 18), p = g.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
          const a = p.getX(i), b = p.getY(i), fall = Math.abs(b) / 2.2;
          const sag = 0.3 * Math.sin(a * 2.1 + b) + 0.34 * Math.sin(a * 0.9) * fall + (1 - Math.abs(a) / 2.5) * 0.1;
          p.setXYZ(i, a, 2 - fall * 2 + sag * (0.5 + fall) * 0.5, b * 0.9);
        }
        g.computeVertexNormals();
        add(g, m.canvas);
        add(new THREE.CylinderGeometry(0.05, 0.06, 5.2, 6), m.bark, 0, 1.92, 0, 0, 0, Math.PI / 2 + 0.05);
        add(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6), m.bark, 2.3, 1, 0.1, 0.1, 0, 0.15);
        break;
      }
      case 'table': add(new THREE.BoxGeometry(1.6, 0.06, 0.8), m.bark, 0, 0.8, 0); for (const [x, z] of [[-0.7, -0.3], [0.7, -0.3], [-0.7, 0.3], [0.7, 0.3]]) add(new THREE.BoxGeometry(0.07, 0.8, 0.07), m.bark, x, 0.4, z); add(new THREE.PlaneGeometry(0.3, 0.42), m.paper, 0.1, 0.84, 0, -Math.PI / 2); break;
      case 'rack': add(new THREE.BoxGeometry(2, 0.08, 0.1), m.bark, 0, 1.2, 0); for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(0.025, 0.03, 1.15), m.copper, -0.8 + i * 0.4, 0.68, 0.06, 0.12); break;
      case 'moss': add(new THREE.PlaneGeometry(5, 3.4, 12, 6), m.wall, 0, 1.6, 0); break;
      case 'scratch': add(new THREE.PlaneGeometry(1.8, 0.9), m.words, 0, 1.4, 0); break;
      case 'tally': add(new THREE.CylinderGeometry(0.42, 0.46, 3), m.tally, 0, 1.5, 0); break;
      case 'carcass': {
        add(crag(1.5, 0.7, 2.4), new THREE.MeshStandardMaterial({ color: 0x3a1a14, roughness: 0.5 }), 0, 0.35, 0);
        for (let i = 0; i < 7; i++) add(new THREE.TorusGeometry(0.9, 0.05, 6, 12, 2.6), m.bone, 0, 0.6, -1.2 + i * 0.4, 0, Math.PI / 2, -0.3);
        break;
      }
      case 'stone_upright': for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283, s = add(crag(0.55, 1.5, 0.42), m.rock, Math.cos(a) * 9, 1.3, Math.sin(a) * 9); s.rotation.y = -a; } break;
      case 'coil': add(new THREE.TorusGeometry(0.7, 0.2, 10, 28), m.copper, 0, 0.9, 0, 0.1); add(new THREE.BoxGeometry(0.5, 0.9, 0.5), m.bark, 0, 0.45, 0); break;
      case 'scorch': add(new THREE.CircleGeometry(5.5, 30), new THREE.MeshStandardMaterial({ color: 0x0d0c0b, roughness: 0.2, metalness: 0.2 }), 0, 0.05, 0, -Math.PI / 2); break;
      case 'bundle': add(new THREE.TorusGeometry(0.04, 0.008, 6, 12), m.copper, 0, 0.05, 0, Math.PI / 2); add(new THREE.TorusGeometry(0.04, 0.008, 6, 12), m.copper, 0.1, 0.05, 0, Math.PI / 2); break;
      case 'newspaper': add(new THREE.BoxGeometry(1.4, 0.05, 0.8), m.bark, 0, 0.8, 0); for (const [x, z] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) add(new THREE.BoxGeometry(0.05, 0.8, 0.05), m.copper, x, 0.4, z); add(new THREE.PlaneGeometry(0.42, 0.56), m.news, 0, 0.84, 0, -Math.PI / 2); break;
      case 'shard': { const c = add(new THREE.OctahedronGeometry(0.14, 0), new THREE.MeshStandardMaterial({ color: 0x0b0b10, emissive: new THREE.Color(0.1, 0.35, 0.8), emissiveIntensity: 3.5, roughness: 0.15 }), 0, 0.22, 0); c.scale.y = 1.9; break; }
      case 'cache': add(new THREE.CylinderGeometry(0.24, 0.3, 0.42, 9), new THREE.MeshStandardMaterial({ color: 0x7a5a2c, roughness: 0.85 }), 0, 0.2, 0); add(new THREE.CircleGeometry(0.2, 9), m.bark, 0, 0.42, 0, -Math.PI / 2); break;
      case 'jacket': add(new THREE.BoxGeometry(0.6, 0.1, 0.8), new THREE.MeshStandardMaterial({ color: 0x4d5a3a, roughness: 0.95 }), 0, 0.06, 0, 0.05, 0.4); break;
      case 'pass': break;
    }
    return root;
  }

  /** Puts a revealed prop into the world. */
  show(id: string) {
    const p = this.waiting.get(id);
    if (!p) return;
    this.waiting.delete(id);
    this.props.set(id, { prop: p, obj: null });
    this.place(id);
  }

  private place(id: string) {
    const e = this.props.get(id);
    if (!e || e.obj) return;
    const def = PROPS[id];
    if (!def) return;
    const p = e.prop;
    let obj: THREE.Object3D | null = null;
    if (def.model) {
      obj = this.proto.get(def.model)![0].clone();
      obj.scale.setScalar(def.scale ?? 1);
      obj.position.set(p.x, p.y + (def.y ?? 0), p.z);
      obj.rotation.set(def.rx ?? 0, p.yaw, 0);
    } else if (def.shape) {
      obj = this.shape(def.shape);
      obj.position.set(p.x, p.y, p.z);
      obj.rotation.y = p.yaw;
    }
    if (obj) this.group.add(obj);
    e.obj = obj;
  }

  async init() {
    await this.makeShapes();
    const files = new Set([...Object.values(PROPS).flatMap((p) => (p.model ? [p.model] : [])), ...Object.values(NODE_MODEL).map((p) => p.file)]);
    await Promise.all([...files].map(async (f) => {
      const g = await loadGLB(f);
      // Keep only LOD0 of multi-LOD assets.
      const keep: THREE.Mesh[] = [];
      g.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && !/_lod[12]/.test(o.name + (o.parent?.name ?? ''))) keep.push(o as THREE.Mesh); });
      const dress = (m: THREE.Mesh) => { m.castShadow = true; m.receiveShadow = true; };
      if (VARIANTS.test(f)) {
        this.proto.set(f, keep.map((m) => {
          const c = m.clone();
          dress(c);
          c.position.set(0, 0, 0);
          const size = new THREE.Box3().setFromObject(c).getSize(new THREE.Vector3());
          c.scale.multiplyScalar(1 / Math.max(size.x, size.y, size.z));
          // Sit on the ground by the object's own lowest point.
          c.position.y = -new THREE.Box3().setFromObject(c).min.y;
          const root = new THREE.Group(); root.add(c);
          return root;
        }));
        return;
      }
      const root = new THREE.Group();
      for (const m of keep) {
        const c = m.clone();
        dress(c);
        m.updateWorldMatrix(true, false); c.applyMatrix4(m.matrixWorld.clone().multiply(m.matrix.clone().invert()));
        root.add(c);
      }
      this.proto.set(f, [root]);
    }));
    for (const p of this.world.meta.props) {
      const def = PROPS[p.id];
      // A hidden prop stays out of the map until the story shows it: nothing to bump into, nothing to read.
      if (def?.hidden) { this.waiting.set(p.id, p); continue; }
      this.props.set(p.id, { prop: p, obj: null });
      this.place(p.id);
    }
    this.ready = true;
  }

  private waiting = new Map<string, StoryProp>();

  setLive(live: number[]) {
    if (!this.ready) return;
    const set = new Set(live);
    for (const n of this.world.meta.nodes) {
      if (!set.has(n.id) || this.nodes.has(n.id)) continue;
      const def = NODE_MODEL[n.kind];
      const kinds = this.proto.get(def.file)!;
      const o = new THREE.Group();
      // A clump is a few of the same plant growing together, which reads from further away.
      for (let i = 0; i < (def.clump ?? 1); i++) {
        const c = kinds[(n.id + i) % kinds.length].clone();
        if (i) { c.position.set(Math.cos(i * 2.4) * 0.3, 0, Math.sin(i * 2.4) * 0.3); c.rotation.y = i * 1.9; }
        o.add(c);
      }
      if (def.look) o.traverse((q) => { const m = q as THREE.Mesh; if (m.isMesh) m.material = this.restyle(n.kind, m.material as THREE.MeshStandardMaterial); });
      o.scale.setScalar(def.scale * (0.8 + ((n.id * 0.37) % 1) * 0.5));
      if (def.tall) o.scale.y *= def.tall;
      o.position.set(n.x, n.y, n.z);
      o.rotation.y = n.id * 2.4;
      o.visible = false;
      this.group.add(o);
      this.nodes.set(n.id, { node: n, obj: o });
    }
  }

  private looks = new Map<string, THREE.Material>();

  /** One scan can stand in for several resources: each kind gets its own dressing of it. */
  private restyle(kind: string, base: THREE.MeshStandardMaterial) {
    const key = `${kind}|${base.uuid}`;
    let mat = this.looks.get(key);
    if (!mat) {
      const look = NODE_MODEL[kind].look!, c = base.clone();
      c.color.setRGB(...look.color); c.roughness = look.roughness; c.roughnessMap = null;
      if (look.plain) c.map = null;
      this.looks.set(key, (mat = c));
    }
    return mat;
  }

  removeNode(id: number) { const e = this.nodes.get(id); if (e) { this.group.remove(e.obj); this.nodes.delete(id); } }
  removeProp(id: string) { const e = this.props.get(id); if (e?.obj) { this.group.remove(e.obj); } this.props.delete(id); }

  update(camera: THREE.Camera) {
    for (const e of this.nodes.values()) e.obj.visible = e.obj.position.distanceToSquared(camera.position) < 70 * 70;
  }
}
