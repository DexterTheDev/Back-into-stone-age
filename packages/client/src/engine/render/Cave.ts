/** Renders the baked limestone cave and the rock outcrop around its mouth. */
import * as THREE from 'three/webgpu';
import { attribute, texture, int, vec3, vec2, float, positionWorld, normalWorldGeometry, abs, pow, mix, smoothstep, normalize, transformNormalToView, clamp, max, uniform, sin, time } from 'three/tsl';
import { loadMaterialArrays } from '../assets.ts';
import { LAYER_FIRE_SHADOW } from './Stage.ts';
import type { WorldData } from '../world.ts';

const SETS = ['c_lime', 'c_wall', 'c_floor', 'c_moss'];

export class Cave {
  group = new THREE.Group();
  meshes: THREE.Mesh[] = [];
  rain = uniform(0);
  constructor(private world: WorldData) {}

  async init(anisotropy: number) {
    const c = this.world.cave;
    const { albedo, data } = await loadMaterialArrays(SETS, 1024, anisotropy);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(c.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(c.positions.length).map((_, i) => c.normals[Math.floor(i / 3) * 4 + i % 3] / 127), 3));
    geo.setAttribute('caveAttr', new THREE.BufferAttribute(c.attrs, 4, true));
    geo.setIndex(new THREE.BufferAttribute(c.indices, 1));

    const attr = attribute('caveAttr', 'vec4');
    const ao = attr.x, sky = attr.y, depth = attr.z, up = attr.w;
    const wp = positionWorld;
    const n = normalWorldGeometry;
    const weights = pow(abs(n), vec3(6));
    const tw = weights.div(weights.x.add(weights.y).add(weights.z));

    const tri = (layer: number, s: number) => {
      const a = texture(albedo, wp.zy.mul(s)).depth(int(layer)).mul(tw.x)
        .add(texture(albedo, wp.xz.mul(s)).depth(int(layer)).mul(tw.y))
        .add(texture(albedo, wp.xy.mul(s)).depth(int(layer)).mul(tw.z));
      const b = texture(data, wp.zy.mul(s)).depth(int(layer)).mul(tw.x)
        .add(texture(data, wp.xz.mul(s)).depth(int(layer)).mul(tw.y))
        .add(texture(data, wp.xy.mul(s)).depth(int(layer)).mul(tw.z));
      return { a, b };
    };
    const lime = tri(0, 0.19), wall = tri(1, 0.27);
    const floorUV = wp.xz.mul(0.37);
    const fa = texture(albedo, floorUV).depth(int(2)), fb = texture(data, floorUV).depth(int(2));
    const ma = texture(albedo, wp.xz.mul(0.21)).depth(int(3)), mb = texture(data, wp.xz.mul(0.21)).depth(int(3));

    const wallMix = smoothstep(0.35, 0.65, lime.a.a.add(wp.y.mul(0.31).sin().mul(0.12)));
    let rgb = mix(lime.a.rgb.mul(vec3(0.7, 0.68, 0.62)), wall.a.rgb.mul(vec3(0.74, 0.72, 0.68)), wallMix);
    let rough = mix(lime.b.b, wall.b.b, wallMix);
    let nx = mix(lime.b.r, wall.b.r, wallMix).mul(2).sub(1);
    let ny = mix(lime.b.g, wall.b.g, wallMix).mul(2).sub(1);
    let occ = mix(lime.b.a, wall.b.a, wallMix);

    // Sediment on flat ground deep inside; moss where daylight reaches.
    const floorK = smoothstep(0.84, 0.97, up.add(fa.a.mul(0.09)));
    rgb = mix(rgb, fa.rgb.mul(vec3(0.62, 0.55, 0.47)), floorK);
    rough = mix(rough, fb.b, floorK);
    nx = mix(nx, fb.r.mul(2).sub(1), floorK); ny = mix(ny, fb.g.mul(2).sub(1), floorK);
    const mossK = smoothstep(0.55, 0.8, up.add(ma.a.mul(0.18))).mul(smoothstep(0.2, 0.5, sky));
    rgb = mix(rgb, ma.rgb.mul(vec3(0.72, 0.84, 0.6)), mossK);
    rough = mix(rough, mb.b, mossK);

    // Seeping water: streaks that darken and polish the rock below bedding planes.
    const seep = smoothstep(0.52, 0.8, sin(wp.x.mul(0.8).add(wp.z.mul(0.63)).add(wall.a.a.mul(4))).mul(0.5).add(0.5)).mul(smoothstep(0.1, 0.55, float(1).sub(sky)));
    const wet = clamp(seep.mul(0.9).add(floorK.mul(0.3)), 0, 1);
    rgb = rgb.mul(mix(float(1), float(0.58), wet));
    rough = mix(rough, rough.mul(0.3), wet);

    const mat = new THREE.MeshStandardNodeMaterial();
    const tint = this.world.meta.look?.caveTint;
    mat.colorNode = tint ? rgb.mul(vec3(tint[0], tint[1], tint[2])) : rgb;
    mat.roughnessNode = max(rough, 0.05);
    mat.metalnessNode = float(0);
    mat.aoNode = ao.mul(occ).mul(mix(smoothstep(0, 0.34, sky).mul(0.92).add(0.008), float(1), smoothstep(0.75, 1, sky)));
    mat.normalNode = transformNormalToView(normalize(n.add(tw.y.mul(vec3(nx, 0, ny.negate()))).add(tw.x.mul(vec3(0, ny, nx))).add(tw.z.mul(vec3(nx, ny, 0)))));
    mat.side = THREE.FrontSide;

    for (const ch of c.chunks) {
      const g = geo.clone();
      g.setIndex(new THREE.BufferAttribute(c.indices.subarray(ch.start, ch.start + ch.count), 1));
      g.boundingBox = new THREE.Box3(new THREE.Vector3(...ch.min), new THREE.Vector3(...ch.max));
      g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.layers.enable(LAYER_FIRE_SHADOW);
      this.meshes.push(mesh); this.group.add(mesh);
    }
    void vec2; void time; void depth;
  }
}
