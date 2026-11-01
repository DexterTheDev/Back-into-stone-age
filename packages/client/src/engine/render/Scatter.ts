/** Grid-binned instancing with distance LOD. Few draw calls, per-cell culling, cheap rebuilds. */
import * as THREE from 'three/webgpu';

export const STRIDE = 5; // x, y, z, yaw, scale

export interface LodSpec { maxDist: number; capacity: number; parts: { geometry: THREE.BufferGeometry; material: THREE.Material; castShadow: boolean; layer?: number }[] }

interface Cell { x: number; z: number; y: number; data: number[] }

export class Scatter {
  group = new THREE.Group();
  private cells = new Map<number, Cell>();
  private lods: { spec: LodSpec; meshes: THREE.InstancedMesh[]; matrix: Float32Array; attr: THREE.InstancedBufferAttribute; count: number }[] = [];
  private last = new THREE.Vector3(1e9, 0, 0);
  private lastDir = new THREE.Vector3();
  private sphere = new THREE.Sphere();
  private dir = new THREE.Vector3();

  constructor(specs: LodSpec[], private cellSize = 32, private extent = 12) {
    for (const spec of specs) {
      const matrix = new Float32Array(spec.capacity * 16);
      const attr = new THREE.InstancedBufferAttribute(matrix, 16).setUsage(THREE.DynamicDrawUsage);
      const meshes = spec.parts.map((p) => {
        const m = new THREE.InstancedMesh(p.geometry, p.material, spec.capacity);
        m.instanceMatrix = attr;
        m.frustumCulled = false;
        m.castShadow = p.castShadow;
        if (p.layer !== undefined) m.layers.set(p.layer);
        m.receiveShadow = true;
        m.count = 0;
        this.group.add(m);
        return m;
      });
      this.lods.push({ spec, meshes, matrix, attr, count: 0 });
    }
  }

  add(x: number, y: number, z: number, yaw: number, scale: number) {
    const k = Math.floor(x / this.cellSize) * 65536 + Math.floor(z / this.cellSize);
    let c = this.cells.get(k);
    if (!c) this.cells.set(k, (c = { x: (Math.floor(x / this.cellSize) + 0.5) * this.cellSize, z: (Math.floor(z / this.cellSize) + 0.5) * this.cellSize, y, data: [] }));
    c.data.push(x, y, z, yaw, scale);
  }

  /** Rebuilds instance buffers when the view changed enough to matter. */
  update(camera: THREE.PerspectiveCamera, frustum: THREE.Frustum, force = false) {
    camera.getWorldDirection(this.dir);
    if (!force && this.last.distanceToSquared(camera.position) < 4 && this.dir.dot(this.lastDir) > 0.985) return false;
    this.last.copy(camera.position); this.lastDir.copy(this.dir);
    for (const l of this.lods) l.count = 0;
    const cx = camera.position.x, cz = camera.position.z;
    const r = this.cellSize * 0.75 + this.extent;
    const maxD = this.lods[this.lods.length - 1].spec.maxDist;
    for (const c of this.cells.values()) {
      const cellD = Math.hypot(c.x - cx, c.z - cz);
      if (cellD > maxD + r) continue;
      this.sphere.center.set(c.x, c.y, c.z); this.sphere.radius = r + 22;
      if (cellD > r * 1.5 && !frustum.intersectsSphere(this.sphere)) continue;
      const d = c.data;
      for (let i = 0; i < d.length; i += STRIDE) {
        const x = d[i], y = d[i + 1], z = d[i + 2];
        const dist = Math.hypot(x - cx, z - cz);
        let li = 0;
        while (li < this.lods.length && dist > this.lods[li].spec.maxDist) li++;
        if (li === this.lods.length) continue;
        const l = this.lods[li];
        if (l.count >= l.spec.capacity) continue;
        const s = d[i + 4], cs = Math.cos(d[i + 3]) * s, sn = Math.sin(d[i + 3]) * s, o = l.count * 16, m = l.matrix;
        m[o] = cs; m[o + 1] = 0; m[o + 2] = -sn; m[o + 3] = 0;
        m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
        m[o + 8] = sn; m[o + 9] = 0; m[o + 10] = cs; m[o + 11] = 0;
        m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
        l.count++;
      }
    }
    for (const l of this.lods) {
      l.attr.needsUpdate = true;
      for (const m of l.meshes) { m.count = l.count; m.visible = l.count > 0; }
    }
    return true;
  }
}
