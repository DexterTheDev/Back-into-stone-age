/** Recast/Detour wrapper shared by the worker and the Node server. */
import { init, importNavMesh, NavMeshQuery } from 'recast-navigation';
import type { Nav, NavPoint } from './world.ts';

export async function loadNav(bin: Uint8Array): Promise<Nav> {
  await init();
  const { navMesh } = importNavMesh(bin);
  const q = new NavMeshQuery(navMesh, { maxNodes: 4096 });
  const halfExtents = { x: 8, y: 10, z: 8 };
  return {
    path(a: NavPoint, b: NavPoint) {
      const r = q.computePath({ x: a.x, y: a.y, z: a.z }, { x: b.x, y: b.y, z: b.z }, { halfExtents, maxPathPolys: 512, maxStraightPathPoints: 64 });
      return r.success ? r.path.map((p) => ({ x: p.x, y: p.y, z: p.z })) : [];
    },
    nearest(p: NavPoint) {
      const r = q.findClosestPoint({ x: p.x, y: p.y, z: p.z }, { halfExtents });
      return r.success ? { x: r.point.x, y: r.point.y, z: r.point.z } : null;
    },
  };
}
