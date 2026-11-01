/** Debug viewer for look development: ?cam=x,y,z,yaw,pitch&t=0.2&preset=high */
import * as THREE from 'three/webgpu';
import { Stage, type Preset } from './render/Stage.ts';
import { Terrain } from './render/Terrain.ts';
import { Sky, phaseAt } from './render/Sky.ts';
import { Cave } from './render/Cave.ts';
import { Flora } from './render/Flora.ts';
import { Creatures } from './render/Creatures.ts';
import { Water } from './render/Water.ts';
import { Fires } from './render/Fires.ts';
import { Anim } from '@dino/shared';
import { WorldData } from './world.ts';

export async function startViewer(canvas: HTMLCanvasElement) {
  const q = new URLSearchParams(location.search);
  const stage = new Stage(canvas, (q.get('preset') as Preset) || 'high', q.has('gl'));
  await stage.init();
  const world = new WorldData();
  await world.load(() => {});
  const terrain = new Terrain(world);
  await terrain.init(8);
  stage.scene.add(terrain.group);
  const sky = new Sky();
  await sky.init(stage.scene);
  const cave = new Cave(world);
  await cave.init(8);
  stage.scene.add(cave.group);
  const flora = new Flora(world, stage.settings.floraR, stage.settings.treeR);
  await flora.init();
  stage.scene.add(flora.group);

  const water = new Water(world); water.init(); stage.scene.add(water.group);
  const creatures = new Creatures();
  await creatures.init();
  stage.scene.add(creatures.group);
  const fires = new Fires();
  await fires.init();
  stage.scene.add(fires.group);
  const fuel = new Map<number, number>();
  if (q.has('fire')) { const [fx, fz] = q.get('fire')!.split(',').map(Number); fires.setFire(1, fx, world.heightAt(fx, fz), fz, true); fuel.set(1, 1); }
  // ?dino=species,x,z,yaw,anim;species,x,z,yaw,anim  species 0 trex, 1 raptor, 2 pectinodon
  const dinos = (q.get('dino') ?? '').split(';').filter(Boolean).map((d, i) => {
    const [species, x, z, yaw, anim] = d.split(',').map(Number);
    return { id: i + 1, species, x, y: q.has('dy') ? Number(q.get('dy')) : world.heightAt(x, z), z, yaw, anim: anim ?? Anim.Idle, speed: anim === Anim.Run ? 8 : anim === Anim.Walk ? 3 : 0, flags: 0 };
  });

  const cam = (q.get('cam') ?? '110,0,150,1.4,0').split(',').map(Number);
  const t = Number(q.get('t') ?? 0.22);
  const weather = Number(q.get('w') ?? 0);
  const groundY = world.heightAt(cam[0], cam[2]);
  stage.camera.position.set(cam[0], cam[1] || groundY + 1.7, cam[2]);
  stage.camera.rotation.set(cam[4], cam[3], 0, 'YXZ');
  stage.camera.updateMatrixWorld();
  const flash = new THREE.SpotLight(0xfff0d0, q.has('flash') ? 900 : 0, 60, 0.46, 0.55, 2);
  flash.position.copy(stage.camera.position);
  flash.target.position.copy(stage.camera.position).add(new THREE.Vector3(0, 0, -1).applyEuler(stage.camera.rotation));
  stage.scene.add(flash, flash.target);

  let frames = 0;
  const times: number[] = [];
  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    times.push(now - last); last = now;
    sky.apply(phaseAt(t), weather, q.has('cave') ? 1 : 0, stage);
    terrain.update(stage.camera);
    flora.update(stage.camera);
    if (dinos.length) { creatures.ingest(dinos, now); creatures.flashlightOn.value = q.has('flash') ? 1 : 0; creatures.update(1 / 60, stage.camera, now, 0); }
    fires.update(fuel, now);
    stage.render();
    frames++;
    if (frames === 40) {
      const w = window as unknown as Record<string, unknown>;
      const recent = times.slice(-20).sort((a, b) => a - b);
      w.__info = { frameMs: recent[10], backend: stage.backend, tris: stage.renderer.info.render.triangles, calls: stage.renderer.info.render.drawCalls };
      w.__backend = stage.backend;
      w.__done = true;
    }
    requestAnimationFrame(loop);
  };
  (window as unknown as Record<string, unknown>).__stage = stage;
  loop();
}
