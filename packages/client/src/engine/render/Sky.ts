/** Photographic sky: cross-fades CC0 HDRIs through the day, procedural stars and moon at night. */
import * as THREE from 'three/webgpu';
import { Fn, uniform, texture, equirectUV, positionWorldDirection, vec2, vec3, mix, float, dot, normalize, smoothstep, pow, max, fract, sin, floor, cos, atan, asin, PI, pmremTexture, fog, length, positionWorld, cameraPosition, exp, clamp, mx_noise_float, time } from 'three/tsl';
import { loadHDR } from '../assets.ts';

export interface DayPhase { t: number; day: number; dusk: number; night: number; twilight: number; sunDir: THREE.Vector3; moonDir: THREE.Vector3 }

/** Azimuth of each photograph's own sun, in radians from the centre of the image. */
const DAY_PHOTO_SUN = 0.59, DUSK_PHOTO_SUN = 0.663;
/** The dusk photograph is exposed about three times brighter than the day one. */
const DUSK_PHOTO_LEVEL = 0.38;

/** t runs 0..1 over the day: dawn .05, day .5, dusk .075, night .375. */
export function phaseAt(t: number): DayPhase {
  const dawnEnd = 0.05, dayEnd = 0.55, duskEnd = 0.625;
  // Sun arc spans dawn start to dusk end.
  const arc = t <= duskEnd ? t / duskEnd : -1;
  const sunAngle = arc >= 0 ? arc * Math.PI : ((t - duskEnd) / (1 - duskEnd)) * Math.PI + Math.PI;
  const az = -0.45;
  const sunDir = new THREE.Vector3(Math.cos(sunAngle), Math.sin(sunAngle) * 0.86, Math.sin(sunAngle) * 0.34 + az * Math.cos(sunAngle)).normalize();
  const moonDir = new THREE.Vector3(-sunDir.x * 0.9, Math.abs(sunDir.y) * 0.8 + 0.25, -sunDir.z + 0.3).normalize();
  const elev = sunDir.y;
  const day = THREE.MathUtils.smoothstep(elev, 0.02, 0.32);
  const night = 1 - THREE.MathUtils.smoothstep(elev, -0.16, -0.02);
  const dusk = Math.max(0, 1 - day - night);
  // Light left in the sky: 1 with the sun clear of the horizon, 0 once it has properly set.
  const twilight = THREE.MathUtils.smoothstep(elev, -0.1, 0.22);
  void dawnEnd; void dayEnd;
  return { t, day, dusk, night, twilight, sunDir, moonDir };
}

export class Sky {
  sunDir = uniform(new THREE.Vector3(0, 1, 0));
  moonDir = uniform(new THREE.Vector3(0, 1, 0));
  dayMix = uniform(1);
  duskMix = uniform(0);
  duskLevel = uniform(DUSK_PHOTO_LEVEL);
  nightMix = uniform(0);
  weather = uniform(0);
  moonPhase = uniform(1);
  fogColor = uniform(new THREE.Color(0.7, 0.75, 0.75));
  fogDensity = uniform(0.0036);
  fogHeight = uniform(0.018);
  sunGlow = uniform(new THREE.Color(1, 0.9, 0.7));
  caveFactor = uniform(0);
  star = uniform(0);
  aurora = uniform(0);
  copper = uniform(0);
  stormFlash = uniform(0);
  private baseFog = new THREE.Color(0.2, 0.27, 0.27);
  private baseDensity = 0.0036;

  /** Each map has its own air. */
  setLook(look?: { fog?: [number, number, number]; fogDensity?: number }) {
    this.baseFog.setRGB(...(look?.fog ?? [0.2, 0.27, 0.27]));
    this.baseDensity = look?.fogDensity ?? 0.0036;
    this.fogDensity.value = this.baseDensity;
  }

  setEnv(e: { star: number; aurora: number; copper: number; ash: number }, flash: number) {
    this.star.value = e.star; this.aurora.value += (e.aurora - this.aurora.value) * 0.02; this.copper.value = e.copper; this.stormFlash.value = flash;
    this.fogDensity.value = this.baseDensity * (1 + e.ash * 1.6);
  }

  async init(scene: THREE.Scene) {
    const [day, over, dusk, misty] = await Promise.all([
      loadHDR('kloofendal_48d_partly_cloudy_puresky'), loadHDR('kloofendal_overcast_puresky'), loadHDR('qwantani_dusk_2_puresky'), loadHDR('kloofendal_misty_morning_puresky'),
    ]);
    for (const t of [day, over, dusk, misty]) { t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = THREE.RepeatWrapping; t.mapping = THREE.EquirectangularReflectionMapping; }

    const sky = Fn(() => {
      const dir = positionWorldDirection;
      // Align each photograph's sun with the simulated sun azimuth.
      const sunAz = atan(this.sunDir.z, this.sunDir.x);
      const rot = (offset: number) => {
        const a = sunAz.add(offset);
        const c = cos(a), s = sin(a);
        return normalize(vec3(dir.x.mul(c).add(dir.z.mul(s)), dir.y, dir.z.mul(c).sub(dir.x.mul(s))));
      };
      const dayCol = mix(texture(day, equirectUV(rot(-DAY_PHOTO_SUN))).rgb.mul(0.9), texture(over, equirectUV(rot(0.4))).rgb.mul(1.05), this.weather);
      const duskCol = texture(dusk, equirectUV(rot(-DUSK_PHOTO_SUN))).rgb.mul(this.duskLevel);
      let col = mix(duskCol, dayCol, this.dayMix);

      // Night: a Cretaceous sky has no light pollution at all.
      const nd = dir;
      const cell = floor(nd.mul(170));
      const h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
      const h2 = fract(h.mul(91.17));
      const star = smoothstep(0.9966, 1, h).mul(h2.mul(h2).mul(4.2)).mul(smoothstep(0.42, 0.05, fract(nd.x.mul(170)).sub(0.5).abs().add(fract(nd.y.mul(170)).sub(0.5).abs())));
      const band = pow(max(float(1).sub(dot(nd, normalize(vec3(0.3, 0.62, -0.72))).abs()), 0), 9).mul(0.07);
      const mw = band.mul(float(0.55).add(mx_noise_float(nd.mul(7.5)).mul(0.6)));
      const md = dot(nd, normalize(this.moonDir));
      const moon = smoothstep(0.99955, 0.9997, md).mul(this.moonPhase).mul(2.8);
      const halo = pow(max(md, 0), 700).mul(0.1).mul(this.moonPhase);
      const nightCol = vec3(0.0036, 0.0052, 0.0105).add(vec3(0.75, 0.82, 1).mul(star.add(mw))).add(vec3(0.85, 0.88, 1).mul(moon.add(halo)));
      col = mix(col, nightCol.mul(float(1).sub(this.weather.mul(0.82))), this.nightMix);
      // The second sun: low in the west, and visible by day once it is close enough.
      const starDir = normalize(vec3(-0.92, 0.2, 0.22));
      const sd = max(dot(nd, starDir), 0);
      const reach = float(0.9).sub(this.star.mul(0.42));
      const disc = smoothstep(float(0.9999).sub(this.star.mul(0.0035)), 1, sd).mul(this.star.mul(60).add(4));
      const glow = pow(sd, float(900).sub(this.star.mul(820))).mul(this.star.mul(3));
      const seen = this.nightMix.add(this.star.mul(this.star)).clamp(0, 1).mul(smoothstep(0, 0.01, this.star));
      col = col.add(vec3(1, 0.86, 0.66).mul(disc.add(glow)).mul(seen));
      void reach;
      // Green curtains over the mountains, as she drew them.
      const az = atan(nd.z, nd.x);
      const veil = sin(az.mul(6).add(mx_noise_float(vec3(az.mul(3), nd.y.mul(2), time.mul(0.12))).mul(5))).mul(0.5).add(0.5);
      const rise = smoothstep(0.08, 0.26, nd.y).mul(smoothstep(0.62, 0.3, nd.y));
      const cur = mx_noise_float(vec3(az.mul(16), nd.y.mul(3).sub(time.mul(0.3)), time.mul(0.2))).mul(0.5).add(0.5);
      col = col.add(vec3(0.12, 0.85, 0.42).mul(veil.mul(cur).mul(rise).mul(0.8)).mul(this.aurora).mul(this.nightMix));
      // Ash in the upper air turns every daylight sky toward copper.
      const lum = dot(col, vec3(0.3, 0.6, 0.1));
      col = mix(col, vec3(lum.mul(1.2), lum.mul(0.62), lum.mul(0.32)), this.copper.mul(0.82));
      col = col.add(vec3(0.7, 0.75, 0.95).mul(this.stormFlash));
      // Under the ground plane the photographs have no data; hide with fog colour.
      return mix(this.fogColor.mul(0.92), col, smoothstep(-0.03, 0.05, dir.y));
    })();
    scene.backgroundNode = sky;

    scene.environment = misty;
    scene.environmentIntensity = 1;

    // Height fog with sun in-scatter. Thick humid haze is both mood and a draw-distance cap.
    const toCam = positionWorld.sub(cameraPosition);
    const d = length(toCam);
    const height = max(positionWorld.y, 0);
    const hf = exp(height.sub(30).mul(this.fogHeight).negate()).clamp(0.2, 1.25);
    const amount = float(1).sub(exp(d.mul(this.fogDensity).mul(hf).negate()));
    const inscatter = pow(max(dot(normalize(toCam), this.sunDir), 0), 7).mul(0.55).mul(this.dayMix.add(this.duskMix));
    const fogCol = mix(this.fogColor, this.sunGlow, inscatter);
    scene.fogNode = fog(fogCol.mul(float(1).sub(this.caveFactor)), amount);
    void vec2; void asin; void PI; void pmremTexture; void clamp; void time;
  }

  apply(p: DayPhase, weather: number, cave: number, stage: { sun: THREE.DirectionalLight; scene: THREE.Scene }) {
    this.sunDir.value.copy(p.sunDir);
    this.moonDir.value.copy(p.moonDir);
    this.dayMix.value = p.day; this.duskMix.value = p.dusk; this.nightMix.value = p.night;
    this.duskLevel.value = DUSK_PHOTO_LEVEL * (0.03 + 0.97 * p.twilight);
    this.weather.value = weather;
    this.caveFactor.value = cave;
    const sun = stage.sun;
    const useMoon = p.night > 0.5;
    const dir = useMoon ? p.moonDir : p.sunDir;
    sun.position.copy(dir).multiplyScalar(400);
    const col = new THREE.Color();
    if (useMoon) {
      col.setRGB(0.55, 0.64, 0.9);
      sun.intensity = 0.05 * this.moonPhase.value * (1 - weather * 0.9);
    } else {
      col.setRGB(1, 0.62, 0.34).lerp(new THREE.Color(1, 0.93, 0.8), p.day);
      sun.intensity = (1.1 * p.dusk * p.twilight + 3.6 * p.day) * (1 - weather * 0.82);
    }
    sun.color.copy(col);
    // Environment colour follows the phase: day white, dusk warm and dim, night almost gone.
    const fade = 0.15 + 0.85 * p.twilight;
    stage.scene.environmentIntensity = (0.42 * p.day + 0.16 * p.dusk * fade + 0.008 * p.night) * (1 - weather * 0.25);
    const fogDay = this.baseFog.clone().lerp(new THREE.Color(0.34, 0.2, 0.11), this.copper.value * 0.8), fogDusk = new THREE.Color(0.3, 0.17, 0.12).multiplyScalar(fade), fogNight = new THREE.Color(0.0045, 0.0065, 0.012);
    this.fogColor.value.copy(fogDay).multiplyScalar(1 - weather * 0.3).lerp(fogDusk, p.dusk).lerp(fogNight, p.night);
    this.sunGlow.value.setRGB(1, 0.82, 0.58).lerp(new THREE.Color(1, 0.52, 0.26), p.dusk);
  }
}
