/** A soft pulse on whatever the current step needs, so the right stone stands out from every other stone. */
import * as THREE from 'three/webgpu';
import { float, sin, smoothstep, time, uv, vec3 } from 'three/tsl';

const MAX = 10;

export class Glints {
  group = new THREE.Group();
  private sprites: THREE.Sprite[] = [];

  init() {
    const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const d = (uv() as any).sub(0.5).length();
    const pulse = sin(time.mul(2.6)).mul(0.3).add(0.7);
    mat.colorNode = vec3(1, 0.88, 0.62).mul(1.15);
    mat.opacityNode = smoothstep(0.5, 0, d).pow(float(3.2)).mul(pulse).mul(0.7);
    for (let i = 0; i < MAX; i++) {
      const s = new THREE.Sprite(mat);
      s.scale.set(0.42, 0.42, 1);
      s.visible = false;
      this.sprites.push(s);
      this.group.add(s);
    }
  }

  set(points: { x: number; y: number; z: number }[]) {
    this.sprites.forEach((s, i) => {
      const p = points[i];
      s.visible = !!p;
      if (p) s.position.set(p.x, p.y + 0.16, p.z);
    });
  }
}
