/** Renderer, scene, camera, shadows and the post-processing chain. */
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, velocity, uniform, vec3, vec4, float, screenUV, mix, smoothstep, length, Fn, time, fract, sin, dot, vec2, luminance, pow, max } from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';

export type Preset = 'low' | 'medium' | 'high' | 'ultra';

export const PRESETS: Record<Preset, { scale: number; shadow: number; cascades: number; far: number; gtao: boolean; bloom: boolean; taa: boolean; floraR: number; treeR: number }> = {
  low: { scale: 0.7, shadow: 1024, cascades: 2, far: 900, gtao: false, bloom: true, taa: false, floraR: 90, treeR: 160 },
  medium: { scale: 0.85, shadow: 1024, cascades: 2, far: 1200, gtao: true, bloom: true, taa: true, floraR: 100, treeR: 170 },
  high: { scale: 1, shadow: 2048, cascades: 3, far: 1600, gtao: true, bloom: true, taa: true, floraR: 135, treeR: 230 },
  ultra: { scale: 1, shadow: 3072, cascades: 4, far: 2200, gtao: true, bloom: true, taa: true, floraR: 180, treeR: 320 },
};

/** Render layers. Everything the player sees also sits on layer 0 or NEAR_ONLY. */
export const LAYER_NEAR_ONLY = 1; // plants: too many for anything but the closest shadow cascade
export const LAYER_FIRE_SHADOW = 2; // what a campfire casts: animals, people, rock

export class Stage {
  renderer!: THREE.WebGPURenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, 1, 0.08, 4000);
  sun = new THREE.DirectionalLight(0xffffff, 3);
  pipeline!: THREE.RenderPipeline;
  csm?: CSMShadowNode;
  preset: Preset;
  /** Post effect controls, driven by gameplay. */
  fx = {
    fear: uniform(0),
    pulse: uniform(0),
    blood: uniform(0),
    blackout: uniform(0),
    exposure: uniform(1),
    desaturate: uniform(0),
  };

  constructor(public canvas: HTMLCanvasElement, preset: Preset, private forceWebGL = false) {
    this.preset = preset;
  }

  get settings() { return PRESETS[this.preset]; }
  get backend(): string { return (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2'; }

  async init() {
    const r = new THREE.WebGPURenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', forceWebGL: this.forceWebGL, logarithmicDepthBuffer: false, trackTimestamp: false });
    await r.init();
    this.renderer = r;
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5) * this.settings.scale);
    r.setSize(this.canvas.clientWidth || innerWidth, this.canvas.clientHeight || innerHeight, false);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.camera.aspect = (this.canvas.clientWidth || innerWidth) / (this.canvas.clientHeight || innerHeight);
    this.camera.updateProjectionMatrix();
    this.camera.layers.enable(LAYER_NEAR_ONLY);

    const s = this.settings;
    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(s.shadow);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 900;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.06;
    this.csm = new CSMShadowNode(sun, { cascades: s.cascades, maxFar: s.cascades > 2 ? 240 : 170, mode: 'practical', lightMargin: 180 });
    this.csm.fade = true;
    sun.shadow.shadowNode = this.csm;
    this.scene.add(sun, sun.target);
    this.buildPipeline();
    addEventListener('resize', this.onResize);
  }

  private onResize = () => {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  private buildPipeline() {
    const s = this.settings;
    const scenePass = pass(this.scene, this.camera);
    const useMRT = s.gtao || s.taa;
    if (useMRT) scenePass.setMRT(mrt({ output, normal: normalView, velocity }));
    const color = scenePass.getTextureNode('output');
    const depth = scenePass.getTextureNode('depth');
    let lit: any = color;
    if (s.gtao) {
      const normal = scenePass.getTextureNode('normal');
      const aoPass = ao(depth, normal, this.camera);
      aoPass.resolutionScale = 0.5;
      aoPass.radius.value = 1.1; aoPass.distanceExponent.value = 1.1; aoPass.scale.value = 1.15; aoPass.samples.value = 10;
      lit = vec4(color.rgb.mul(aoPass.getTextureNode().r), color.a);
    }
    let image: any = lit;
    if (s.taa) {
      const v = scenePass.getTextureNode('velocity');
      image = traa(lit, depth, v, this.camera);
    }
    if (s.bloom) {
      const b = bloom(image as never, 0.13, 0.55, 0.92);
      image = image.add(b);
    }
    const { fear, pulse, blood, blackout, exposure, desaturate } = this.fx;
    const grade = Fn(([c]: any[]) => {
      const uv = screenUV;
      const d = length(uv.sub(0.5).mul(vec2(1.3, 1)));
      const vign = smoothstep(0.32, 0.92, d);
      let rgb: any = c.rgb.mul(exposure);
      rgb = rgb.mul(float(1).sub(vign.mul(float(0.34).add(fear.mul(0.5)).add(pulse.mul(fear).mul(0.25)))));
      const lum = luminance(rgb);
      rgb = mix(rgb, vec3(lum as any), desaturate.add(fear.mul(0.25)).clamp(0, 1));
      // Slight teal shadows, warm highlights: photographic cross-curve.
      const toe = smoothstep(0, 0.5, lum);
      rgb = rgb.mul(mix(vec3(0.93, 1.0, 1.03), vec3(1.03, 1.0, 0.95), toe));
      rgb = mix(rgb, vec3(0.28, 0, 0), blood.mul(smoothstep(0.15, 0.75, d)).mul(0.82));
      const grain = fract(sin(dot(uv.mul(1000.0).add(fract(time.mul(13.7))), vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5);
      rgb = rgb.add(grain.mul(0.022).mul(pow(max(float(1).sub(lum), 0.05), 2)));
      rgb = rgb.mul(float(1).sub(blackout));
      return vec4(rgb.clamp(0, 64), 1);
    });
    this.pipeline = new THREE.RenderPipeline(this.renderer, grade(image));
  }

  private cascadesTuned = false;
  private resScale = 1;
  private sinceUp = 99;
  private upWait = 10;
  private slowT = 0;
  private fastT = 0;

  /** Dynamic resolution: drop a step when frames run long, recover when there is headroom. */
  /** Holds 60 fps by trading resolution. Going down is quick. Coming back up is slow, and slower each time it fails. */
  adapt(dt: number) {
    if (dt > 1 / 52) { this.slowT += dt; this.fastT = 0; } else if (dt < 1 / 57) { this.fastT += dt; this.slowT = 0; }
    this.sinceUp += dt;
    let next = this.resScale;
    if (this.slowT > 1.2 && next > 0.55) {
      next = Math.max(0.55, next - 0.08); this.slowT = 0;
      if (this.sinceUp < 6) this.upWait = Math.min(180, this.upWait * 2);
    }
    if (this.fastT > this.upWait && next < 1) { next = Math.min(1, next + 0.08); this.fastT = 0; this.sinceUp = 0; }
    if (next !== this.resScale) {
      this.resScale = next;
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * this.settings.scale * next);
    }
  }

  render() {
    this.pipeline.render();
    const csm = this.csm as unknown as { lights?: { shadow: THREE.LightShadow }[] } | undefined;
    if (!this.cascadesTuned && csm?.lights?.length) {
      this.cascadesTuned = true;
      csm.lights[0].shadow.camera.layers.enable(LAYER_NEAR_ONLY);
    }
  }
}
