/**
 * Things in the hand. Every item is rebuilt so its origin is the grip and +Y runs along the handle
 * toward the working end. The arm then closes on that point, so hand and item cannot drift apart.
 */
import * as THREE from 'three/webgpu';
import { loadGLB, loadTexture } from '../assets.ts';
import type { Arms, HoldPose } from './People.ts';
import { flameMaterial } from './Fires.ts';

type V3 = [number, number, number];

// Forearm comes in from the lower right. Handles keep clear of the middle of the view.
const OUT: V3 = [-0.52, 0.34, -0.78];
const POSES = {
  /** Barrel through the fist, pointing where you look. */
  flashlight: { clip: 'Sword_Idle', at: [0.2, -0.19, -0.44], axis: [-0.04, 0.07, -1], forearm: OUT },
  /** Haft leaning ahead, ready to swing. */
  tool: { clip: 'Sword_Idle', at: [0.23, -0.2, -0.45], axis: [-0.15, 0.74, -0.66], forearm: [-0.42, 0.22, -0.88] },
  /** Edge out in front, as you would carry a knife to cut. */
  knife: { clip: 'Sword_Idle', at: [0.22, -0.2, -0.44], axis: [-0.52, 0.6, -0.6], forearm: [-0.5, 0.06, -0.86] },
  /** Resting on the open palm, out in front of you. */
  palm: { clip: 'Idle_Loop', at: [0.15, -0.205, -0.4], axis: [0.88, 0.14, -0.46], forearm: [-0.44, 0.2, -0.87], itemUp: [0, 1, 0.12], itemAt: [0.15, -0.17, -0.41] },
} satisfies Record<string, HoldPose>;

const lod0 = (root: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh && !/_lod[12]/.test(o.name + (o.parent?.name ?? ''))) out.push(o as THREE.Mesh); });
  return out;
};

/** Arm-length objects sit close to the lens, so they get a touch of their own light. */
function prepare(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    if (mat.map && !mat.emissiveMap) { mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.07; }
    m.material = mat;
  });
}

interface Fit {
  /** Size along the longest side, which becomes +Y. */
  length: number;
  /** Where the grip sits along it: 0 at the near end, 1 at the far end. */
  grip: number;
  flip?: boolean;
  /** Squashes the model across its length, to turn a round stone into a flake. */
  width?: number;
  depth?: number;
  /** Leaves the model as authored, with `length` as its largest size. For things that sit rather than point. */
  keep?: boolean;
}

/** Lays a scanned model along +Y at a real-world size, with the grip at the origin. */
function fit(source: THREE.Object3D, o: Fit) {
  const inner = new THREE.Group(); inner.add(source);
  source.position.set(0, 0, 0);
  const raw = new THREE.Box3().setFromObject(inner).getSize(new THREE.Vector3());
  const long = o.keep ? '' : raw.z >= raw.x && raw.z >= raw.y ? 'z' : raw.x >= raw.y ? 'x' : 'y';
  if (long === 'z') inner.rotation.x = o.flip ? Math.PI / 2 : -Math.PI / 2;
  else if (long === 'x') inner.rotation.z = o.flip ? -Math.PI / 2 : Math.PI / 2;
  else if (long === 'y' && o.flip) inner.rotation.x = Math.PI;
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3());
  const s = o.length / (o.keep ? Math.max(size.x, size.y, size.z) : size.y), c = box.getCenter(new THREE.Vector3());
  inner.scale.setScalar(s);
  inner.position.set(-c.x * s, -(box.min.y + size.y * o.grip) * s, -c.z * s);
  const g = new THREE.Group(); g.add(inner);
  if (o.width) g.scale.x = o.width / (size.x * s);
  if (o.depth) g.scale.z = o.depth / (size.z * s);
  return g;
}

/** Hand-cut wood: slightly crooked, tapering, never a perfect cylinder. */
function stick(length: number, r0: number, r1: number, y0: number, mat: THREE.Material, seed: number) {
  const g = new THREE.CylinderGeometry(r1, r0, length, 10, 10, false);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const v = p.getY(i) / length;
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const lump = 1 + 0.1 * Math.sin(a * 3 + v * 9 + seed) + 0.06 * Math.sin(v * 23 + seed * 2);
    p.setXYZ(i, p.getX(i) * lump + Math.sin(v * 3.1 + seed) * 0.007, p.getY(i), p.getZ(i) * lump + Math.cos(v * 2.3 + seed) * 0.006);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.position.y = y0 + length / 2;
  return m;
}

export async function buildHeld(arms: Arms) {
  const [torch, stones, rock, compass, recorder, radio, bark, barkN, cord, cordN] = await Promise.all([
    loadGLB('small_plastic_torch'), loadGLB('namaqualand_stones_01'), loadGLB('rock_07'), loadGLB('seadogs_compass'),
    loadGLB('portable_cassette_player'), loadGLB('vintage_radio_transceiver'),
    loadTexture('tex/b_pine_a.jpg', true), loadTexture('tex/b_pine_n.jpg', false),
    loadTexture('tex/b_palm_a.jpg', true), loadTexture('tex/b_palm_n.jpg', false),
  ]);
  bark.repeat.set(0.35, 1.4); barkN.repeat.copy(bark.repeat);
  cord.repeat.set(2, 0.5); cordN.repeat.copy(cord.repeat);
  const wood = new THREE.MeshStandardMaterial({ map: bark, normalMap: barkN, roughness: 0.92, color: 0x8f938a });
  const fibre = new THREE.MeshStandardMaterial({ map: cord, normalMap: cordN, roughness: 1, color: 0xc9b285 });

  const stone = (i: number) => lod0(stones.scene)[i].clone();
  /** Scan sets lay out every accessory beside the object. In the hand we want the object alone. */
  const without = (scene: THREE.Object3D, drop: RegExp) => {
    const c = scene.clone(), gone: THREE.Object3D[] = [];
    c.traverse((o) => { if ((o as THREE.Mesh).isMesh && drop.test(o.name)) gone.push(o); });
    for (const o of gone) o.removeFromParent();
    return c;
  };
  /** Knapped flint: dark, glassy, dressed down from a real scanned nodule. */
  const flint = (o: THREE.Object3D) => o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    mat.color.setRGB(0.2, 0.22, 0.26); mat.roughness = 0.24; mat.roughnessMap = null;
    m.material = mat;
  });

  // Flashlight: beam leaves through a marker at the lens.
  const fl = fit(lod0(torch.scene)[0].clone(), { length: 0.21, grip: 0.36 });
  const lens = new THREE.Object3D(); lens.position.y = 0.21 * 0.64 + 0.01; fl.add(lens);

  // Hand axe: a stick, a chipped stone and a lot of fibre.
  const axe = new THREE.Group();
  axe.add(stick(0.46, 0.0165, 0.0135, -0.1, wood, 1.3));
  const head = stone(1); flint(head);
  const headFit = fit(head, { length: 0.14, grip: 0.42, width: 0.075, depth: 0.04 });
  headFit.rotation.z = -Math.PI / 2 + 0.12; headFit.position.set(-0.012, 0.3, 0);
  axe.add(headFit);
  for (let i = 0; i < 4; i++) {
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.0235, 0.0042, 6, 18), fibre);
    wrap.rotation.set(Math.PI / 2 + (i - 1.5) * 0.28, (i % 2 ? 1 : -1) * 0.34, 0);
    wrap.position.set(0, 0.276 + i * 0.016, 0);
    axe.add(wrap);
  }

  // Flint blade: long chip with a fibre-bound butt to hold it by.
  const edge = stone(0); flint(edge);
  const blade = fit(edge, { length: 0.2, grip: 0.22, width: 0.05, depth: 0.014 });
  const shard = new THREE.Group(); shard.add(blade);
  for (let i = 0; i < 5; i++) {
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.0145, 0.0036, 6, 14), fibre);
    wrap.rotation.x = Math.PI / 2 + (i % 2 ? 0.08 : -0.08); wrap.scale.set(1, 0.52, 1);
    wrap.position.y = -0.024 + i * 0.011;
    shard.add(wrap);
  }

  const nodule = stone(2); flint(nodule);
  const lump = fit(nodule, { length: 0.085, grip: 0.1, keep: true });
  const hammer = fit(lod0(rock.scene)[0].clone(), { length: 0.09, grip: 0.1, keep: true });

  const branch = new THREE.Group(); branch.add(stick(0.52, 0.015, 0.0095, -0.16, wood, 2.6));
  const log = new THREE.Group(); log.add(stick(0.34, 0.023, 0.021, -0.14, wood, 4.1));

  // Sharpened stick: a branch whittled to a pale, uneven point.
  const spike = new THREE.Group();
  spike.add(stick(0.72, 0.0155, 0.011, -0.2, wood, 5.2));
  const pale = new THREE.MeshStandardMaterial({ color: 0xb79d78, roughness: 0.82 });
  const point = new THREE.Mesh(new THREE.ConeGeometry(0.0118, 0.14, 7, 2), pale);
  point.position.y = 0.59; spike.add(point);

  // Fire-hardened spear: longer, thicker, charred at the tip.
  const spear = new THREE.Group();
  spear.add(stick(1.05, 0.0175, 0.0135, -0.32, wood, 6.1));
  const char = new THREE.Mesh(new THREE.ConeGeometry(0.0145, 0.2, 7, 2), new THREE.MeshStandardMaterial({ color: 0x14100d, roughness: 0.6 }));
  char.position.y = 0.83; spear.add(char);

  // Stone pick: short haft, heavy head set across it.
  const pick = new THREE.Group();
  pick.add(stick(0.42, 0.017, 0.015, -0.1, wood, 7.7));
  const pickHead = stone(2); flint(pickHead);
  const pickFit = fit(pickHead, { length: 0.2, grip: 0.5, width: 0.05, depth: 0.05 });
  pickFit.rotation.z = -Math.PI / 2; pickFit.position.set(0, 0.29, 0);
  pick.add(pickFit);

  // Torch: fibre-bound head on a branch, burning.
  const brand = new THREE.Group();
  brand.add(stick(0.5, 0.0155, 0.0125, -0.14, wood, 3.4));
  const wad = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.11, 10, 3), new THREE.MeshStandardMaterial({ map: cord, normalMap: cordN, roughness: 1, color: 0x4a3a2b }));
  wad.position.y = 0.33; brand.add(wad);
  // Flames stand straight up whatever the stick is doing, and face the eye.
  const level = { value: 1 } as { value: number; node?: { value: number } };
  const burn = flameMaterial(level, 7.3);
  level.node!.value = 0.62;
  const flame = new THREE.Group(); flame.position.y = 0.37; brand.add(flame);
  flame.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...POSES.tool.axis).normalize()).invert();
  for (let i = 0; i < 3; i++) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.3), burn);
    q.position.set((i - 1) * 0.008, 0.09, 0); q.rotation.y = (i - 1) * 0.42;
    flame.add(q);
  }

  const items: [string, THREE.Object3D, HoldPose, THREE.Object3D?][] = [
    ['flashlight', fl, POSES.flashlight, lens],
    ['hand_axe', axe, POSES.tool],
    ['spike', spike, POSES.tool],
    ['spear', spear, POSES.tool],
    ['stone_pick', pick, POSES.tool],
    ['blade', shard, POSES.knife],
    ['torch', brand, POSES.tool, flame],
    ['branch', branch, POSES.tool],
    ['wood', log, POSES.tool],
    ['flint', lump, POSES.palm],
    ['stone', hammer, POSES.palm],
    ['compass', fit(without(compass.scene, /lid/), { length: 0.1, grip: 0, keep: true }), POSES.palm],
    ['recorder', fit(without(recorder.scene, /casette/), { length: 0.17, grip: 0, keep: true }), POSES.palm],
    ['radio', fit(without(radio.scene, /antenna|microphone|morse|cable|plug/), { length: 0.22, grip: 0, keep: true }), POSES.palm],
  ];
  for (const [id, obj, pose, marker] of items) { prepare(obj); arms.add(id, obj, pose, marker); }
}
