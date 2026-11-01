/** Skinned dinosaurs: pooling, LOD, cross-faded clips, jaw and head-tracking layered over the animation. */
import * as THREE from 'three/webgpu';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { uniform, vec3, float, positionWorld, cameraPosition, normalize, dot, normalView, pow, max, texture, uv } from 'three/tsl';
import { Anim, SPECIES, type DinoSnap, type SpeciesId } from '@dino/shared';
import { BASE, loadGLB } from '../assets.ts';
import { LAYER_FIRE_SHADOW } from './Stage.ts';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];
const CLIP: Record<number, string> = { [Anim.Idle]: 'Idle', [Anim.Walk]: 'Walk', [Anim.Run]: 'Run', [Anim.Attack]: 'Attack', [Anim.Jump]: 'Jump', [Anim.Death]: 'Death', [Anim.Roar]: 'Idle', [Anim.Sniff]: 'Idle' };

interface Sample { t: number; x: number; y: number; z: number; yaw: number; speed: number; anim: number }

interface Actor {
  id: number; species: SpeciesId; root: THREE.Object3D; mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>; current: string;
  jaw: THREE.Object3D | null; jawBind: THREE.Quaternion; jawAngle: number; head: THREE.Object3D | null; neck: THREE.Object3D | null;
  /** Head and neck as the animation left them, before the look is layered on. */
  headPose: THREE.Quaternion; neckPose: THREE.Quaternion; look: number;
  lods: THREE.Object3D[]; lodLevel: number; hist: Sample[]; lastAnim: number; animTick: number; pos: THREE.Vector3; yaw: number; speed: number; anim: number; breath: number;
}

export class Creatures {
  group = new THREE.Group();
  actors = new Map<number, Actor>();
  private assets = new Map<string, GLTF>();
  flashlightOn = uniform(0);
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();

  /** Skinned animals. Anything without a bake yet borrows the nearest relative rather than failing. */
  private async loadAsset(id: string) {
    try {
      const head = await fetch(`${BASE}creatures/${id}.glb`, { method: 'HEAD' });
      if (!head.ok || !(head.headers.get('content-type') ?? '').includes('gltf') && !(head.headers.get('content-type') ?? '').includes('octet')) return false;
    } catch { return false; }
    return true;
  }

  async init() {
    for (const id of ['trex', 'raptor', 'triceratops', 'hadrosaur', 'ankylosaur', 'pachy']) {
      if (!(await this.loadAsset(id))) continue;
      const g = await new (await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader()
        .setMeshoptDecoder((await import('three/addons/libs/meshopt_decoder.module.js')).MeshoptDecoder)
        .loadAsync(`${BASE}creatures/${id}.glb`);
      g.scene.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (!m.isMesh) return;
        m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.name === 'eye') m.material = this.eyeMaterial(mat);
        if (mat.name === 'feather') { mat.alphaTest = 0.4; mat.side = THREE.DoubleSide; mat.envMapIntensity = 0.6; }
      });
      this.assets.set(id, g);
    }
    const rat = await loadGLB('street_rat');
    this.rat = rat.scene;
  }
  private rat: THREE.Object3D | null = null;

  /** Water and sky animals have no rig in the source pack: they are built here and moved by code. */
  private proc(species: SpeciesId): THREE.Object3D {
    const root = new THREE.Group();
    const add = (g: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = root) => { const m = new THREE.Mesh(g, mat); m.castShadow = true; parent.add(m); return m; };
    if (species === 'croc') {
      const hide = new THREE.MeshStandardMaterial({ color: 0x2a2c1c, roughness: 0.55 });
      const body = add(new THREE.SphereGeometry(1, 16, 10), hide); body.scale.set(0.8, 0.34, 2.8);
      const head = add(new THREE.ConeGeometry(0.42, 1.9, 10), hide); head.rotation.x = -Math.PI / 2; head.scale.set(1, 0.42, 1); head.position.set(0, 0.04, -3.4);
      for (const s of [-0.26, 0.26]) { const e = add(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshStandardMaterial({ color: 0xa08020, emissive: 0x302000, roughness: 0.2 })); e.position.set(s, 0.24, -2.75); }
      const tail = new THREE.Group(); tail.name = 'Tail'; tail.position.z = 2.6; root.add(tail);
      const t = add(new THREE.ConeGeometry(0.6, 4.6, 8), hide, tail); t.rotation.x = Math.PI / 2; t.scale.y = 1; t.scale.x = 0.5; t.position.z = 2.2;
      for (let i = 0; i < 12; i++) { const r = add(new THREE.ConeGeometry(0.08, 0.2, 5), hide); r.position.set((i % 2 ? 0.2 : -0.2), 0.32, -2 + i * 0.4); }
    } else if (species === 'pterosaur') {
      const skin = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.8, side: THREE.DoubleSide });
      const body = add(new THREE.SphereGeometry(0.8, 12, 10), skin); body.scale.set(0.8, 0.8, 1.9);
      const neck = add(new THREE.CylinderGeometry(0.12, 0.26, 3.2, 8), skin); neck.rotation.x = Math.PI / 2 - 0.25; neck.position.set(0, 0.5, -2.6);
      const head = add(new THREE.ConeGeometry(0.28, 3.4, 8), skin); head.rotation.x = -Math.PI / 2 + 0.1; head.position.set(0, 0.95, -5.2);
      const crest = add(new THREE.ConeGeometry(0.16, 1.2, 6), skin); crest.rotation.x = Math.PI / 2 - 0.5; crest.position.set(0, 1.2, -3.7);
      for (const s of [-1, 1]) {
        const w = new THREE.Group(); w.name = s < 0 ? 'WingL' : 'WingR'; w.position.set(s * 0.5, 0.2, -0.4); root.add(w);
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -1.2, 0, 0, 1.3, s * 3.8, 0.1, -0.6, s * 3.8, 0.1, -0.6, 0, 0, 1.3, s * 3.8, 0.1, 1.2, s * 3.8, 0.1, -0.6, s * 3.8, 0.1, 1.2, s * 8.5, 0, 0.3], 3)); g.computeVertexNormals();
        add(g, skin, w);
      }
    } else if (this.rat) {
      const r = this.rat.clone(); r.scale.setScalar(2.2); root.add(r);
      root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.material = (m.material as THREE.Material).clone(); (m.material as THREE.MeshStandardMaterial).color?.setHex(0x3a3028); } });
    }
    return root;
  }

  clear() { for (const [id, a] of this.actors) { this.group.remove(a.root); a.mixer.stopAllAction(); this.actors.delete(id); } }

  /** Tapetum: a retroreflective flash whenever a light source sits near the viewer's line of sight. */
  private eyeMaterial(src: THREE.MeshStandardMaterial) {
    const mat = new THREE.MeshStandardNodeMaterial();
    const tex = texture(src.map!, uv());
    mat.colorNode = tex.rgb;
    mat.roughnessNode = float(0.08);
    mat.metalnessNode = float(0);
    const view = normalize(cameraPosition.sub(positionWorld));
    void view;
    const facing = pow(max(normalView.z, 0), 5);
    mat.emissiveNode = vec3(1.2, 0.95, 0.28).mul(facing).mul(this.flashlightOn).mul(tex.r.add(0.05)).mul(3.2);
    return mat;
  }

  private create(id: number, species: SpeciesId): Actor {
    const sp = SPECIES[species];
    const fallback = sp.asset === 'triceratops' || sp.asset === 'ankylosaur' ? 'trex' : 'raptor';
    const g = this.assets.get(sp.asset) ?? this.assets.get(fallback)!;
    const procedural = sp.asset.startsWith('proc_');
    const root = procedural ? this.proc(species) : cloneSkeleton(g.scene);
    root.scale.multiplyScalar(sp.scale);
    root.traverse((o) => o.layers.enable(LAYER_FIRE_SHADOW));
    // Elder raptors are the same animal, older and darker.
    if (species === 'dakotaraptor' || species === 'widow') root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const c = (m.material as THREE.MeshStandardMaterial).clone(); c.color.multiplyScalar(species === 'widow' ? 0.55 : 0.75); m.material = c; } });
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const c of procedural ? [] : g.animations) {
      const a = mixer.clipAction(c);
      if (c.name === 'Death' || c.name === 'Attack' || c.name === 'Jump') { a.loop = c.name === 'Attack' ? THREE.LoopRepeat : THREE.LoopOnce; a.clampWhenFinished = c.name !== 'Attack'; }
      actions.set(c.name, a);
    }
    actions.get('Idle')?.play();
    const lods: THREE.Object3D[] = [];
    for (const n of ['lod0', 'lod1', 'lod2']) { const o = root.getObjectByName(n); if (o) lods.push(o); }
    const jaw = root.getObjectByName('Jaw') ?? null;
    const head = root.getObjectByName('Head') ?? null, neck = root.getObjectByName('Neck') ?? null;
    const a: Actor = {
      id, species, root, mixer, actions, current: 'Idle', jaw, jawBind: jaw ? jaw.quaternion.clone() : new THREE.Quaternion(), jawAngle: 0,
      head, neck, headPose: head ? head.quaternion.clone() : new THREE.Quaternion(), neckPose: neck ? neck.quaternion.clone() : new THREE.Quaternion(), look: 0, lods, lodLevel: -1, hist: [], lastAnim: 0, animTick: Math.random() * 10,
      pos: new THREE.Vector3(), yaw: 0, speed: 0, anim: 0, breath: Math.random() * 6,
    };
    this.group.add(root);
    this.actors.set(id, a);
    return a;
  }

  /** Called on each snapshot. */
  ingest(list: DinoSnap[], t: number) {
    const seen = new Set<number>();
    for (const d of list) {
      seen.add(d.id);
      const a = this.actors.get(d.id) ?? this.create(d.id, SPECIES_IDS[d.species]);
      a.hist.push({ t, x: d.x, y: d.y, z: d.z, yaw: d.yaw, speed: d.speed, anim: d.anim });
      if (a.hist.length > 6) a.hist.shift();
    }
    for (const [id, a] of this.actors) if (!seen.has(id)) { this.group.remove(a.root); a.mixer.stopAllAction(); this.actors.delete(id); }
  }

  private moveProc(a: Actor, now: number) {
    const t = now * 0.001, sp = SPECIES[a.species];
    if (sp.asset === 'proc_croc') { const tail = a.root.getObjectByName('Tail'); if (tail) tail.rotation.y = Math.sin(t * (1 + a.speed)) * 0.28; }
    if (sp.asset === 'proc_pterosaur') {
      const beat = a.anim === Anim.Run ? Math.sin(t * 2) * 0.1 - 0.45 : Math.sin(t * 2.6) * 0.34;
      const l = a.root.getObjectByName('WingL'), r = a.root.getObjectByName('WingR');
      if (l) l.rotation.z = -beat; if (r) r.rotation.z = beat;
    }
  }

  /** Turns a bone about world up. The axis has to be worked out in that bone's own parent space. */
  private turn(bone: THREE.Object3D, angle: number) {
    const up = this.v.set(0, 1, 0).applyQuaternion(bone.parent!.getWorldQuaternion(this.q).invert()).normalize();
    bone.quaternion.premultiply(this.q.setFromAxisAngle(up, angle));
  }

  private play(a: Actor, name: string) {
    if (a.current === name) return;
    const next = a.actions.get(name), prev = a.actions.get(a.current);
    if (!next) return;
    next.reset().play();
    if (prev) next.crossFadeFrom(prev, name === 'Attack' ? 0.12 : 0.28, true);
    a.current = name;
  }

  update(dt: number, camera: THREE.Camera, now: number, interp = 110) {
    const renderT = now - interp;
    for (const a of this.actors.values()) {
      const sp = SPECIES[a.species];
      const h = a.hist;
      if (!h.length) continue;
      let s0 = h[0], s1 = h[h.length - 1];
      for (let i = 0; i < h.length - 1; i++) if (h[i].t <= renderT && h[i + 1].t >= renderT) { s0 = h[i]; s1 = h[i + 1]; break; }
      const k = s1.t > s0.t ? Math.max(0, Math.min(1, (renderT - s0.t) / (s1.t - s0.t))) : 1;
      a.pos.set(s0.x + (s1.x - s0.x) * k, s0.y + (s1.y - s0.y) * k, s0.z + (s1.z - s0.z) * k);
      let dy = (s1.yaw - s0.yaw) % (Math.PI * 2); if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2;
      a.yaw = s0.yaw + dy * k; a.speed = s0.speed + (s1.speed - s0.speed) * k; a.anim = s1.anim;
      a.root.position.copy(a.pos);
      // The source animals face +Z, our yaw of zero faces -Z.
      a.root.rotation.y = a.yaw + Math.PI;

      const dist = a.pos.distanceTo(camera.position);
      if (sp.asset.startsWith('proc_')) { this.moveProc(a, now); continue; }
      const big = a.species === 'trex' || sp.radius > 1.2;
      const level = dist < (big ? 70 : 30) ? 0 : dist < (big ? 170 : 80) ? 1 : 2;
      if (level !== a.lodLevel) { a.lodLevel = level; a.lods.forEach((o, i) => { o.visible = i === Math.min(level, a.lods.length - 1); }); }

      const name = CLIP[a.anim] ?? 'Idle';
      this.play(a, name);
      const act = a.actions.get(name);
      if (act) {
        if (name === 'Walk') act.timeScale = Math.max(0.25, a.speed / sp.walkClipSpeed);
        else if (name === 'Run') act.timeScale = Math.max(0.35, a.speed / sp.runClipSpeed);
        else act.timeScale = 1;
      }
      // Animation level of detail: distant animals update at 15 Hz.
      a.animTick += dt;
      const step = dist < 60 ? 0 : 1 / 15;
      // The mixer only writes a bone whose animated value changed, so on a still clip last frame's look
      // would stay on the bone and stack up. Take it off first.
      a.head?.quaternion.copy(a.headPose);
      a.neck?.quaternion.copy(a.neckPose);
      if (a.animTick >= step) { a.mixer.update(a.animTick); a.animTick = 0; }
      if (a.head) a.headPose.copy(a.head.quaternion);
      if (a.neck) a.neckPose.copy(a.neck.quaternion);

      // Layers on top of the clip: jaw, breathing, and looking at the nearest thing that matters.
      if (a.jaw && dist < 80) {
        const want = a.anim === Anim.Attack ? 0.62 : a.anim === Anim.Roar ? 0.75 : a.anim === Anim.Sniff ? 0.08 : a.anim === Anim.Run ? 0.2 : 0.035 + 0.02 * Math.sin((a.breath += dt * 1.2));
        a.jawAngle += (want - a.jawAngle) * Math.min(1, dt * 11);
        a.jaw.quaternion.copy(a.jawBind);
        a.jaw.getWorldQuaternion(this.q);
        const parentWorld = new THREE.Quaternion();
        a.jaw.parent!.getWorldQuaternion(parentWorld);
        const axis = this.v.set(1, 0, 0).applyQuaternion(a.root.quaternion).applyQuaternion(parentWorld.clone().invert()).normalize();
        a.jaw.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, a.jawAngle));
      }
      if (a.head) {
        let want = 0;
        if (dist < 45 && a.anim !== Anim.Death) {
          const dir = this.v2.copy(camera.position).sub(a.pos);
          const local = Math.atan2(dir.x, dir.z) - a.root.rotation.y;
          const norm = Math.atan2(Math.sin(local), Math.cos(local));
          if (Math.abs(norm) < 1.4) want = THREE.MathUtils.clamp(norm, -0.7, 0.7) * 0.5;
        }
        a.look += (want - a.look) * Math.min(1, dt * 5);
        if (Math.abs(a.look) > 1e-3) {
          a.root.updateMatrixWorld();
          if (a.neck) this.turn(a.neck, a.look * 0.5);
          this.turn(a.head, a.look);
        }
      }
    }
  }
}
