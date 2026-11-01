/** Rain, drifting ash, and the sky events of Chapter 3. Particles wrap around the camera in the vertex stage, so they cost no CPU. */
import * as THREE from 'three/webgpu';
import { Fn, attribute, cameraPosition, positionGeometry, time, uniform, vec3, float, mod } from 'three/tsl';
import type { EnvView } from '@dino/shared';
import type { Sky } from './Sky.ts';

function field(count: number, w: number, h: number, box: number, fall: number, drift: number, color: THREE.Color, opacity: any, additive: boolean) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-w, -h, 0, w, -h, 0, w, h, 0, -w, h, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  g.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 3));
  g.instanceCount = count;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const seed = attribute('seed', 'vec3');
  mat.positionNode = Fn(() => {
    const size = vec3(box, box * 0.6, box);
    const flow = vec3(time.mul(drift), time.mul(-fall).mul(seed.y.mul(0.4).add(0.8)), time.mul(drift * 0.4));
    const p = seed.mul(size).add(flow).sub(cameraPosition);
    const wrapped = mod(p, size).sub(size.mul(0.5));
    return wrapped.add(cameraPosition).add(positionGeometry);
  })();
  mat.colorNode = vec3(color.r, color.g, color.b);
  mat.opacityNode = float(1).mul(opacity);
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false; m.renderOrder = 9; m.visible = false;
  return m;
}

export class Atmosphere {
  private rain = uniform(0) as any;
  private ash = uniform(0) as any;
  private rainMesh!: THREE.Mesh;
  private ashMesh!: THREE.Mesh;
  private sky!: Sky;
  private flash = 0;

  init(scene: THREE.Scene, sky: Sky) {
    this.sky = sky;
    this.rainMesh = field(1400, 0.006, 0.42, 34, 15, 1.2, new THREE.Color(0.55, 0.6, 0.66), this.rain, true);
    this.ashMesh = field(900, 0.022, 0.022, 40, 0.7, 1.1, new THREE.Color(0.32, 0.3, 0.28), this.ash, false);
    scene.add(this.rainMesh, this.ashMesh);
  }

  update(dt: number, cam: THREE.Camera, e: EnvView, weather: number, cave: number) {
    const open = 1 - cave;
    this.rain.value = Math.max(0, weather - 0.15) * 0.34 * open;
    this.ash.value = e.ash * 0.7 * open;
    this.rainMesh.visible = this.rain.value > 0.01;
    this.ashMesh.visible = this.ash.value > 0.01;
    // Storm light: a white flash on the sky, more of them the closer the strike.
    if (e.storm > 0 && Math.random() < dt * 0.12 * e.storm) this.flash = 1;
    this.flash *= Math.exp(-dt * 6);
    this.sky.setEnv(e, this.flash);
    void cam;
  }
}
