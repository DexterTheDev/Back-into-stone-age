/** Asset loading helpers shared by every render system. */
import * as THREE from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const BASE = `${import.meta.env.BASE_URL}assets/`;

/** Fetches a gzip file. Handles hosts that already decoded it via Content-Encoding. */
export async function fetchGz(path: string): Promise<ArrayBuffer> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export interface Pixels { width: number; height: number; data: Uint8ClampedArray }

export async function loadPixels(path: string): Promise<Pixels> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const bmp = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close();
  return { data, width, height };
}

const arrays = new Map<string, ReturnType<typeof buildMaterialArrays>>();

/** Texture arrays are shared by every map, so a change of map does not decode them again. */
export function loadMaterialArrays(names: string[], size = 1024, anisotropy = 8) {
  const key = `${names.join()}|${size}`;
  let a = arrays.get(key);
  if (!a) { a = buildMaterialArrays(names, size, anisotropy); arrays.set(key, a); }
  return a;
}

/** Builds two texture arrays from JPG triples: albedo + height, and normal xy + rough + AO. */
async function buildMaterialArrays(names: string[], size: number, anisotropy: number) {
  const a = new Uint8Array(size * size * 4 * names.length);
  const b = new Uint8Array(size * size * 4 * names.length);
  await Promise.all(names.map(async (name, layer) => {
    const [alb, nrm, hra] = await Promise.all([loadPixels(`tex/${name}_a.jpg`), loadPixels(`tex/${name}_n.jpg`), loadPixels(`tex/${name}_h.jpg`)]);
    const base = layer * size * size * 4;
    for (let i = 0; i < size * size; i++) {
      const o = base + i * 4, s = i * 4;
      a[o] = alb.data[s]; a[o + 1] = alb.data[s + 1]; a[o + 2] = alb.data[s + 2]; a[o + 3] = hra.data[s];
      b[o] = nrm.data[s]; b[o + 1] = nrm.data[s + 1]; b[o + 2] = hra.data[s + 1]; b[o + 3] = hra.data[s + 2];
    }
  }));
  const make = (data: Uint8Array, srgb: boolean) => {
    const t = new THREE.DataArrayTexture(data, size, size, names.length);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true; t.anisotropy = anisotropy;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { albedo: make(a, true), data: make(b, false) };
}

const texLoader = new THREE.TextureLoader();
export async function loadTexture(path: string, srgb: boolean, repeat = true): Promise<THREE.Texture> {
  const t = await texLoader.loadAsync(BASE + path);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}

const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
export const loadGLB = (path: string): Promise<GLTF> => gltfLoader.loadAsync(`${BASE}models/${path}.glb`);
export const loadHDR = (path: string): Promise<THREE.DataTexture> => new HDRLoader().loadAsync(`${BASE}sky/${path}.hdr`);

export function pixelsToTexture(p: { width: number; height: number; data: Uint8ClampedArray | Uint8Array }, opts: { srgb?: boolean; nearest?: boolean } = {}) {
  const t = new THREE.DataTexture(new Uint8Array(p.data.buffer, p.data.byteOffset, p.data.byteLength), p.width, p.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.minFilter = opts.nearest ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
  t.magFilter = opts.nearest ? THREE.NearestFilter : THREE.LinearFilter;
  t.generateMipmaps = !opts.nearest;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}
