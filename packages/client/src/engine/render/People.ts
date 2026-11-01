/** Survivors: remote teammates, the first-person arms and the bodies left behind. */
import * as THREE from 'three/webgpu';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { PF_CROUCH, PF_DEAD, PF_DOWNED, PF_MOVING, PF_SPRINT, PF_WORKING } from '@dino/shared';
import { BASE, loadTexture } from '../assets.ts';
import { LAYER_FIRE_SHADOW } from './Stage.ts';

const TEAM = [
  { name: 'varga', base: 'female' }, { name: 'okafor', base: 'female' }, { name: 'hale', base: 'male' }, { name: 'reyes', base: 'male' },
] as const;

export interface Person { root: THREE.Object3D; mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>; current: string }

export class People {
  private glb = new Map<string, GLTF>();
  private tex = new Map<string, { map: THREE.Texture; normal: THREE.Texture }>();

  async init() {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    await Promise.all(['male', 'female'].map(async (b) => this.glb.set(b, await loader.loadAsync(`${BASE}people/${b}.glb`))));
    await Promise.all(TEAM.map(async (t) => {
      const [map, normal] = await Promise.all([loadTexture(`people/${t.name}.webp`, true, false), loadTexture(`people/${t.name}_n.webp`, false, false)]);
      map.flipY = false; normal.flipY = false;
      this.tex.set(t.name, { map, normal });
    }));
  }

  create(character: number): Person {
    const t = TEAM[Math.max(0, Math.min(3, character))];
    const g = this.glb.get(t.base)!;
    const root = cloneSkeleton(g.scene);
    const tex = this.tex.get(t.name)!;
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      m.layers.enable(LAYER_FIRE_SHADOW);
      const src = m.material as THREE.MeshStandardMaterial;
      if (/Superhero/i.test(src.name)) {
        const mat = src.clone();
        mat.map = tex.map; mat.normalMap = tex.normal; mat.needsUpdate = true;
        m.material = mat;
      }
    });
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map(g.animations.map((c) => [c.name, mixer.clipAction(c)]));
    for (const n of ['Death01', 'PickUp_Table']) { const a = actions.get(n); if (a) { a.loop = THREE.LoopOnce; a.clampWhenFinished = true; } }
    actions.get('Idle_Loop')?.play();
    return { root, mixer, actions, current: 'Idle_Loop' };
  }

  /** A plain colour over the whole figure, for people who are not one of the team. */
  dress(p: Person, color: number) {
    p.root.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isMesh) { const c = (m.material as THREE.MeshStandardMaterial).clone(); c.color.setHex(color); m.material = c; } });
  }

  animate(p: Person, flags: number) {
    let want = 'Idle_Loop';
    if (flags & PF_DEAD) want = 'Death01';
    else if (flags & PF_DOWNED) want = 'Crouch_Idle_Loop';
    else if (flags & PF_WORKING) want = 'Fixing_Kneeling';
    else if (flags & PF_CROUCH) want = flags & PF_MOVING ? 'Crouch_Fwd_Loop' : 'Crouch_Idle_Loop';
    else if (flags & PF_MOVING) want = flags & PF_SPRINT ? 'Sprint_Loop' : 'Walk_Loop';
    if (want === p.current) return;
    const next = p.actions.get(want), prev = p.actions.get(p.current);
    if (!next) return;
    next.reset().play();
    if (prev) next.crossFadeFrom(prev, 0.22, true);
    p.current = want;
  }
}

/** How a hand takes hold of something. Vectors are in camera space: -Z ahead, +X right, +Y up. */
export interface HoldPose {
  clip: string;
  time?: number;
  /** Where the middle of the fist sits. */
  at: [number, number, number];
  /** Direction the fist runs, little finger toward thumb. This is the handle of whatever is held. */
  axis: [number, number, number];
  /** Direction the forearm points, elbow toward wrist. */
  forearm: [number, number, number];
  /** Set when the item does not run along the fist, such as something resting on the palm. */
  itemUp?: [number, number, number];
  itemAt?: [number, number, number];
}

export interface HandMotion { bob: number; speed: number; lookX: number; lookY: number }

const vec = (v: [number, number, number]) => new THREE.Vector3(...v);
const basis = (a: THREE.Vector3, d: THREE.Vector3) => {
  const z = new THREE.Vector3().crossVectors(a, d).normalize(), y = new THREE.Vector3().crossVectors(z, a).normalize();
  return new THREE.Matrix4().makeBasis(a, y, z);
};

/** First-person arm: a real character's forearm and hand, closed around whatever it holds. */
export class Arms {
  group = new THREE.Group();
  private items = new Map<string, { obj: THREE.Object3D; pose: HoldPose; lens?: THREE.Object3D }>();
  private want = '';
  private cur = '';
  private lift = 0;
  private swingT = 1;
  private lagX = 0;
  private lagY = 0;

  constructor(private person: Person, camera: THREE.Camera) {
    const root = person.root;
    const keep = /^(lowerarm_r|hand_r|.*_0[1-4]_r|.*_0[1-4]_leaf_r)$/;
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      m.castShadow = false; m.receiveShadow = false;
      if (!/Superhero/i.test((m.material as THREE.Material).name)) { m.visible = false; return; }
      // Keep only triangles that belong to the forearm and hand.
      const g = m.geometry.clone();
      const si = g.getAttribute('skinIndex'), idx = g.index!, out: number[] = [];
      const bones = m.skeleton.bones.map((b) => keep.test(b.name));
      for (let t = 0; t < idx.count; t += 3) {
        const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
        if (bones[si.getX(a)] && bones[si.getX(b)] && bones[si.getX(c)]) out.push(a, b, c);
      }
      g.setIndex(out);
      m.geometry = g;
      // A little bounce from the beam, so the arm never reads as a black cut-out.
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.1;
      m.material = mat;
    });
    person.actions.get('Idle_Loop')?.stop();
    camera.add(this.group);
    this.group.visible = false;
  }

  add(id: string, obj: THREE.Object3D, pose: HoldPose, lens?: THREE.Object3D) {
    obj.visible = false;
    this.group.add(obj);
    this.items.set(id, { obj, pose, lens });
  }

  /** Lowers what is held, swaps it out of sight, brings the new thing up. */
  hold(id: string) { this.want = this.items.has(id) ? id : ''; }

  swing() { this.swingT = 0; }

  get held() { return this.cur; }

  /** The object held right now, if it is fully out. */
  get lens() { return this.items.get(this.cur)?.lens ?? null; }

  private bone(name: string) { return this.person.root.getObjectByName(name)!; }
  private at(name: string) { return this.bone(name).getWorldPosition(new THREE.Vector3()); }

  /** Fist measured from the fingers: its centre and its axis, little finger toward index. */
  private fist() {
    const i = this.at('index_01_r').add(this.at('index_03_r')).multiplyScalar(0.5);
    const p = this.at('pinky_01_r').add(this.at('pinky_03_r')).multiplyScalar(0.5);
    return { axis: i.clone().sub(p).normalize(), centre: i.add(p).multiplyScalar(0.5) };
  }

  private forearm() { return this.at('hand_r').sub(this.at('lowerarm_r')).normalize(); }

  /** Sets the pose, bends the wrist to fit the item, then moves the arm so the fist lands on the grip. */
  private apply(p: HoldPose) {
    const { root, mixer, actions } = this.person;
    this.group.remove(root);
    root.position.set(0, 0, 0); root.quaternion.identity();
    mixer.stopAllAction();
    const act = actions.get(p.clip)!;
    act.reset().play(); act.paused = true; act.time = p.time ?? 0.3;
    mixer.update(0);
    root.updateMatrixWorld(true);

    const A = vec(p.axis).normalize(), D = vec(p.forearm).normalize();
    const hand = this.bone('hand_r');
    const a0 = this.fist().axis, d0 = this.forearm();
    const n = new THREE.Vector3().crossVectors(d0, a0).normalize();
    const bend = new THREE.Quaternion().setFromAxisAngle(n, A.angleTo(D) - a0.angleTo(d0));
    const parent = hand.parent!.getWorldQuaternion(new THREE.Quaternion());
    hand.quaternion.premultiply(parent.clone().invert().multiply(bend).multiply(parent));
    root.updateMatrixWorld(true);

    const { axis, centre } = this.fist();
    const from = basis(axis, this.forearm()), to = basis(A, D);
    root.quaternion.setFromRotationMatrix(to.multiply(from.transpose()));
    root.position.copy(vec(p.at)).sub(centre.applyQuaternion(root.quaternion));
    this.group.add(root);
  }

  private show(id: string) {
    for (const [k, e] of this.items) e.obj.visible = k === id;
    this.cur = id;
    const e = this.items.get(id);
    if (!e) return;
    this.apply(e.pose);
    const p = e.pose;
    e.obj.position.copy(vec(p.itemAt ?? p.at));
    e.obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec(p.itemUp ?? p.axis).normalize());
  }

  update(dt: number, m: HandMotion) {
    if (this.want !== this.cur) {
      this.lift = Math.max(0, this.lift - dt * 7);
      if (this.lift <= 0) this.show(this.want);
    } else if (this.cur) this.lift = Math.min(1, this.lift + dt * 5);
    this.group.visible = !!this.cur;
    if (!this.cur) return;

    // The hand trails the view a little, which is most of what makes it feel carried.
    const k = 1 - Math.exp(-dt * 11);
    this.lagX += (THREE.MathUtils.clamp(m.lookX * 0.006, -0.03, 0.03) - this.lagX) * k;
    this.lagY += (THREE.MathUtils.clamp(m.lookY * 0.006, -0.025, 0.025) - this.lagY) * k;
    const down = (1 - this.lift) ** 2;
    this.swingT = Math.min(1, this.swingT + dt * 3.4);
    const swing = Math.sin(this.swingT * Math.PI);
    this.group.position.set(
      Math.sin(m.bob * 0.5) * 0.009 * m.speed + this.lagX,
      Math.cos(m.bob) * 0.006 * m.speed - this.lagY - down * 0.42 - swing * 0.05,
      -swing * 0.07,
    );
    this.group.rotation.set(this.lagY * 1.3 + down * 0.5 - swing * 0.75, this.lagX * 1.3, 0);
  }
}
