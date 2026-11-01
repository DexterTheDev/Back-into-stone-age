/** Reads baked world files from disk for the server and tests. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import RAPIER from '@dimforge/rapier3d-compat';
import type { WorldMeta } from '../world/constants.ts';
import { loadNav } from './nav.ts';
import { SimWorld, type WorldBlobs } from './world.ts';

export async function loadWorldFromDisk(assetsDir: string, withNav = true, map = 'hollow'): Promise<SimWorld> {
  const dir = path.join(assetsDir, 'world', map === 'hollow' ? '' : map);
  const gz = (name: string) => { const b = zlib.gunzipSync(fs.readFileSync(path.join(dir, name + '.gz'))); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
  await RAPIER.init();
  const blobs: WorldBlobs = {
    meta: JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')) as WorldMeta,
    physHeights: new Float32Array(gz('phys-height.bin')),
    cavePos: new Float32Array(gz('cave-col-pos.bin')),
    caveIdx: new Uint32Array(gz('cave-col-idx.bin')),
    obstacles: new Float32Array(gz('obstacles.bin')),
    nav: withNav ? new Uint8Array(gz('nav.bin')) : null,
  };
  const nav = blobs.nav ? await loadNav(blobs.nav) : null;
  return new SimWorld(RAPIER, blobs, nav);
}
