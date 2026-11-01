/**
 * Spatial audio: HRTF panning, occlusion filters and cave reverb on the Web Audio API.
 * The forest is built from CC0 field recordings: layered beds of different lengths that drift
 * against each other, plus single calls lifted from those recordings and placed around the listener.
 */
import { BASE } from '../assets.ts';

interface Clip { buffer: AudioBuffer; start: number; length: number; gain?: number }
type Bank = Clip[];
type Surface = 'leaf' | 'mud' | 'rock' | 'gravel' | 'water';

/** Recordings arrive at wildly different levels. Beds are scaled to this RMS before mixing. */
const BED_RMS = 0.07;

function rms(b: AudioBuffer) {
  const d = b.getChannelData(0);
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 17) { sum += d[i] * d[i]; n++; }
  return Math.sqrt(sum / Math.max(1, n));
}

/** Folds the tail over the head with an equal-power fade, so a recording loops with no seam. */
function seamless(ctx: AudioContext, b: AudioBuffer, fade = 4) {
  const X = Math.floor(Math.min(fade, b.duration / 4) * b.sampleRate), n = b.length - X;
  const out = ctx.createBuffer(b.numberOfChannels, n, b.sampleRate);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c), o = out.getChannelData(c);
    o.set(d.subarray(0, n));
    for (let i = 0; i < X; i++) {
      const t = (i / X) * Math.PI * 0.5;
      o[i] = d[i] * Math.sin(t) + d[n + i] * Math.cos(t);
    }
  }
  return out;
}

/** Finds single footfalls: sharp rises in level, against the level just before them. */
function footfalls(b: AudioBuffer, length = 0.34): Bank {
  const d = b.getChannelData(0), win = Math.floor(b.sampleRate * 0.01), env: number[] = [];
  for (let i = 0; i + win < d.length; i += win) { let s = 0; for (let j = 0; j < win; j += 4) s += Math.abs(d[i + j]); env.push(s / (win / 4)); }
  const mean = env.reduce((a, v) => a + v, 0) / env.length;
  const clips: Bank = [];
  let last = -100;
  for (let i = 12; i < env.length - 40; i++) {
    let before = 0;
    for (let k = 1; k <= 10; k++) before += env[i - k];
    before /= 10;
    if (env[i] < mean * 1.6 || env[i] < before * 2.2 || i - last < 26) continue;
    last = i;
    const start = Math.max(0, (i - 1) * 0.01);
    let peak = 0;
    for (let k = 0; k < 34; k++) peak = Math.max(peak, env[i + k] ?? 0);
    clips.push({ buffer: b, start, length, gain: Math.min(4, 0.09 / peak) });
  }
  return clips;
}

/** Picks the busiest stretches of high-frequency sound out of a recording: birds, frogs, insects. */
function calls(b: AudioBuffer, count: number): Bank {
  const d = b.getChannelData(0), win = Math.floor(b.sampleRate * 0.5), energy: [number, number][] = [];
  for (let i = 0, w = 0; i + win < d.length; i += win, w++) {
    let s = 0;
    for (let j = 1; j < win; j += 3) { const h = d[i + j] - d[i + j - 1]; s += h * h; }
    energy.push([s, w]);
  }
  const taken: number[] = [];
  for (const [, w] of energy.sort((x, y) => y[0] - x[0])) {
    if (taken.length >= count) break;
    if (taken.every((t) => Math.abs(t - w) > 4)) taken.push(w);
  }
  return taken.map((w) => ({ buffer: b, start: Math.max(0, w * 0.5 - 0.4), length: 2.4 }));
}

function noiseBuffer(ctx: AudioContext, seconds: number, brown = false) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return b;
}

function impulse(ctx: AudioContext, seconds: number, decay: number) {
  const b = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** decay;
  }
  return b;
}

export class GameAudio {
  ctx: AudioContext;
  master: GainNode;
  private sfx: GainNode;
  private ambience: GainNode;
  private verb: ConvolverNode;
  private wet: GainNode;
  private noise: AudioBuffer;
  private brown: AudioBuffer;
  private banks = new Map<string, Bank>();
  private beds = new Map<string, GainNode>();
  private tone: BiquadFilterNode;
  private lastStep = -1;
  private drip = 0;
  private heartT = 0;
  private birdT = 4;
  private fireNode?: { gain: GainNode; panner: PannerNode };
  private fireBuffer?: AudioBuffer;
  occlusion: (x: number, y: number, z: number) => boolean = () => false;
  active = 0;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
    // Everything outdoors runs through one filter: from inside the cave the forest is a muffled wash.
    this.tone = this.ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 18000; this.tone.Q.value = 0.3;
    this.ambience = this.ctx.createGain(); this.ambience.gain.value = 1.2;
    this.ambience.connect(this.tone); this.tone.connect(this.master);
    this.verb = this.ctx.createConvolver(); this.verb.buffer = impulse(this.ctx, 2.8, 2.6);
    this.wet = this.ctx.createGain(); this.wet.gain.value = 0.12;
    this.verb.connect(this.wet); this.wet.connect(this.master);
    this.noise = noiseBuffer(this.ctx, 4);
    this.brown = noiseBuffer(this.ctx, 6, true);
  }

  async load() {
    const decode = async (url: string) => this.ctx.decodeAudioData(await (await fetch(BASE + url)).arrayBuffer());
    const addFiles = async (name: string, files: string[]) => {
      const clips = await Promise.all(files.map(async (f) => { try { const buffer = await decode(`audio/${f}`); return { buffer, start: 0, length: buffer.duration }; } catch (e) { console.warn('audio', f, e); return null; } }));
      this.banks.set(name, clips.filter((c): c is Clip => !!c));
    };
    try {
      const rex = await decode('audio/t-rex_calls.mp3');
      this.banks.set('trex', this.split(rex).map(([a, e]) => ({ buffer: rex, start: a, length: e - a })));
    } catch (e) { console.warn('audio trex', e); }
    await Promise.all([
      addFiles('raptor', ['monster_02.ogg', 'monster_05.ogg', 'monster_09.ogg', 'grunt_03.ogg', 'grunt_06.ogg', 'attack_01.ogg', 'attack_03.ogg']),
      addFiles('hurt', ['hurt_01.ogg', 'hurt_03.ogg', 'die_01.ogg']),
      ...(['leaf', 'mud', 'gravel'] as const).map(async (k) => {
        try { this.banks.set(`step_${k}`, footfalls(await decode(`audio/field/steps_${k === 'leaf' ? 'leaves' : k}.mp3`))); } catch (e) { console.warn('audio steps', e); }
      }),
    ]);
    // The beds are long. They fade in when ready and never hold up the loading screen.
    void this.startAmbience(decode);
  }

  /** Finds separate calls in a recording by its silence gaps. */
  private split(b: AudioBuffer) {
    const d = b.getChannelData(0), win = Math.floor(b.sampleRate * 0.03);
    const env: number[] = [];
    for (let i = 0; i + win < d.length; i += win) { let s = 0; for (let j = 0; j < win; j += 8) s += Math.abs(d[i + j]); env.push(s / (win / 8)); }
    const th = Math.max(...env) * 0.05;
    const cuts: [number, number][] = [];
    let start = -1, quiet = 0;
    env.forEach((v, i) => {
      if (v > th) { if (start < 0) start = i; quiet = 0; } else if (start >= 0 && ++quiet > 8) { const a = (start * win) / b.sampleRate, e = ((i - quiet) * win) / b.sampleRate; if (e - a > 0.2) cuts.push([a, e]); start = -1; }
    });
    if (start >= 0) cuts.push([(start * win) / b.sampleRate, b.duration]);
    return cuts.length ? cuts : [[0, b.duration]] as [number, number][];
  }

  private bed(name: string, raw: AudioBuffer) {
    const buffer = seamless(this.ctx, raw);
    const src = this.ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
    const level = this.ctx.createGain(); level.gain.value = Math.min(6, Math.max(0.15, BED_RMS / Math.max(1e-4, rms(raw))));
    const gain = this.ctx.createGain(); gain.gain.value = 0;
    src.connect(level); level.connect(gain); gain.connect(this.ambience);
    src.start(0, Math.random() * buffer.duration);
    this.beds.set(name, gain);
  }

  private async startAmbience(decode: (url: string) => Promise<AudioBuffer>) {
    await Promise.all(['day_forest', 'day_jungle', 'dawn_forest', 'night_frogs', 'wind_trees', 'wind_leaves', 'river_big', 'river_small'].map(async (n) => {
      try {
        const raw = await decode(`audio/field/${n}.mp3`);
        if (n === 'dawn_forest') this.banks.set('calls_day', calls(raw, 26));
        if (n === 'night_frogs') this.banks.set('calls_night', calls(raw, 18));
        this.bed(n, raw);
      } catch (e) { console.warn('audio', n, e); }
    }));
    try { this.fireBuffer = seamless(this.ctx, await decode('audio/field/fire.mp3'), 2); } catch (e) { console.warn('audio fire', e); }
  }

  listener(x: number, y: number, z: number, fx: number, fy: number, fz: number) {
    const l = this.ctx.listener, t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(x, t, 0.02); l.positionY.setTargetAtTime(y, t, 0.02); l.positionZ.setTargetAtTime(z, t, 0.02);
      l.forwardX.setTargetAtTime(fx, t, 0.02); l.forwardY.setTargetAtTime(fy, t, 0.02); l.forwardZ.setTargetAtTime(fz, t, 0.02);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else l.setPosition(x, y, z);
  }

  private setBed(name: string, v: number, t: number, smooth: number) { this.beds.get(name)?.gain.setTargetAtTime(v, t, smooth); }

  /** Per-frame ambience mix from where the player stands. */
  environment(opts: { dayMix: number; night: number; chorus: number; cave: number; river: number; tension: number; fear: number; dt: number; listenerY: number }) {
    const t = this.ctx.currentTime, { dayMix, night, chorus, cave, river, tension, fear, dt } = opts;
    const out = 1 - cave;
    // Animals go quiet when something big is near. Losing the birds is the first warning.
    const life = out * (1 - Math.min(0.85, tension * 0.9 + fear * 0.006));
    const noon = dayMix * (1 - chorus);
    this.setBed('day_forest', noon * life * 0.95, t, 1.2);
    this.setBed('day_jungle', noon * life * 0.55, t, 1.2);
    this.setBed('dawn_forest', chorus * life * 1.1, t, 1.2);
    this.setBed('night_frogs', night * life * 0.9, t, 1.2);
    // Two slow waves against each other, so gusts arrive unevenly.
    const gust = 0.55 + 0.3 * Math.sin(t * 0.17) + 0.25 * Math.sin(t * 0.071 + 1.7);
    // Inside, the same wind through the rock becomes the room tone. The cave is never truly silent.
    this.setBed('wind_trees', 0.42 * out * gust + 0.08 * out + 0.9 * cave, t, 0.8);
    this.setBed('wind_leaves', 0.26 * out * Math.max(0, gust - 0.25), t, 0.6);
    this.setBed('river_big', 1.3 * river * river * (0.25 + 0.75 * out), t, 0.5);
    this.setBed('river_small', 1 * river ** 3 * out, t, 0.5);
    this.tone.frequency.setTargetAtTime(18000 * Math.pow(340 / 18000, cave), t, 0.25);
    this.wet.gain.setTargetAtTime(0.1 + cave * 0.42, t, 0.5);

    if (cave > 0.5) { this.drip -= dt; if (this.drip < 0) { this.drip = 0.8 + Math.random() * 3.6; this.dripSound(); } }
    if (cave < 0.3 && life > 0.45) {
      this.birdT -= dt;
      if (this.birdT < 0) { this.birdT = 2.5 + Math.random() * 8; this.forestCall(night > 0.5 ? 'calls_night' : 'calls_day', night > 0.5); }
    }
    if (fear > 45) {
      this.heartT -= dt;
      if (this.heartT < 0) { this.heartT = 60 / (62 + fear * 0.9); this.heartbeat(fear / 100); }
    }
  }

  /** A single voice somewhere in the trees: lifts the bed out of flat stereo into a real space. */
  private forestCall(bank: string, low: boolean) {
    const b = this.banks.get(bank);
    if (!b?.length) return;
    const clip = b[Math.floor(Math.random() * b.length)], l = this.ctx.listener, t = this.ctx.currentTime;
    const a = Math.random() * 6.28, r = 12 + Math.random() * 48;
    const d = this.spatial((l.positionX?.value ?? 0) + Math.cos(a) * r, (l.positionY?.value ?? 0) + (low ? 0 : 6 + Math.random() * 14), (l.positionZ?.value ?? 0) + Math.sin(a) * r, 16);
    const src = this.ctx.createBufferSource(); src.buffer = clip.buffer; src.playbackRate.value = 0.94 + Math.random() * 0.14;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = low ? 500 : 1300;
    const g = this.ctx.createGain(), peak = 0.5 + Math.random() * 0.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.4);
    g.gain.setValueAtTime(peak, t + clip.length - 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + clip.length);
    src.connect(hp); hp.connect(g); g.connect(d);
    src.start(t, clip.start, clip.length);
  }

  private spatial(x: number, y: number, z: number, refDist: number) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = refDist; p.rolloffFactor = 1.1; p.maxDistance = 900;
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = this.occlusion(x, y, z) ? 420 : 16000;
    p.connect(lp); lp.connect(this.sfx);
    const send = this.ctx.createGain(); send.gain.value = 0.45; lp.connect(send); send.connect(this.verb);
    return p;
  }

  private burst(dest: AudioNode, type: BiquadFilterType, freq: number, q: number, peak: number, attack: number, release: number, sweep?: number) {
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + attack + release);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 3); s.stop(t + attack + release + 0.05);
  }

  /** Your own feet play straight to the ears: a panner sitting on the listener only smears them. */
  footstep(_x: number, _y: number, _z: number, surface: Surface, loud: number) {
    const bank = this.banks.get(`step_${surface === 'rock' ? 'gravel' : surface === 'water' ? 'mud' : surface}`);
    const out = this.ctx.createGain(); out.gain.value = 1;
    out.connect(this.sfx);
    const send = this.ctx.createGain(); send.gain.value = 0.25; out.connect(send); send.connect(this.verb);
    if (bank?.length) {
      let i = Math.floor(Math.random() * bank.length);
      if (i === this.lastStep) i = (i + 1) % bank.length;
      this.lastStep = i;
      const c = bank[i], src = this.ctx.createBufferSource(); src.buffer = c.buffer;
      src.playbackRate.value = (surface === 'rock' ? 0.8 : surface === 'water' ? 1.2 : 1) * (0.93 + Math.random() * 0.15);
      const tone = this.ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = surface === 'rock' ? 2200 : 11000;
      const g = this.ctx.createGain(), t = this.ctx.currentTime, v = (0.16 + loud * 0.42) * (c.gain ?? 1);
      g.gain.setValueAtTime(v, t); g.gain.setValueAtTime(v, t + c.length * 0.7); g.gain.linearRampToValueAtTime(0, t + c.length);
      src.connect(tone); tone.connect(g); g.connect(out);
      src.start(t, c.start, c.length);
    }
    if (surface === 'water') this.burst(out, 'bandpass', 1300, 0.8, 0.1 + loud * 0.18, 0.02, 0.24, 500);
    if (surface === 'rock') this.burst(out, 'lowpass', 200, 1, 0.05 + loud * 0.12, 0.002, 0.08);
  }

  private dripSound() {
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    const a = Math.random() * 6.28, r = 3 + Math.random() * 14, l = this.ctx.listener;
    const d = this.spatial((l.positionX?.value ?? 0) + Math.cos(a) * r, (l.positionY?.value ?? 0) + 2, (l.positionZ?.value ?? 0) + Math.sin(a) * r, 3);
    o.frequency.setValueAtTime(1400 + Math.random() * 900, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.09);
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(g); g.connect(d); o.start(t); o.stop(t + 0.15);
  }

  heartbeat(level: number) {
    const t = this.ctx.currentTime;
    for (const [off, v] of [[0, 1], [0.17, 0.72]] as const) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.setValueAtTime(70, t + off); o.frequency.exponentialRampToValueAtTime(36, t + off + 0.13);
      g.gain.setValueAtTime(0.0001, t + off); g.gain.exponentialRampToValueAtTime(0.5 * level * v, t + off + 0.018); g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.16);
      o.connect(g); g.connect(this.sfx); o.start(t + off); o.stop(t + off + 0.2);
    }
  }

  private voice(bank: string, x: number, y: number, z: number, volume: number, ref: number, rate: number, pick?: number) {
    const b = this.banks.get(bank);
    if (!b?.length) return;
    const clip = b[pick ?? Math.floor(Math.random() * b.length)];
    const src = this.ctx.createBufferSource(); src.buffer = clip.buffer; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = volume;
    src.connect(g); g.connect(this.spatial(x, y, z, ref));
    src.start(0, clip.start, clip.length);
  }

  play(id: string, x: number, y: number, z: number, volume = 1) {
    switch (id) {
      case 'trex_roar': this.voice('trex', x, y, z, 2.2 * volume, 90, 0.82); break;
      case 'trex_far': this.voice('trex', x, y, z, 1.4 * volume, 120, 0.7); break;
      case 'raptor_call': this.voice('raptor', x, y, z, 1.2 * volume, 9, 1.05 + Math.random() * 0.25); break;
      case 'raptor_chirp': this.voice('raptor', x, y, z, 0.9 * volume, 8, 1.4 + Math.random() * 0.5); break;
      case 'bite': { const d = this.spatial(x, y, z, 3); this.burst(d, 'lowpass', 900, 1, 0.8, 0.003, 0.18); this.voice('hurt', x, y, z, 1, 4, 1); break; }
      case 'knap': { const d = this.spatial(x, y, z, 6); this.burst(d, 'bandpass', 3400, 7, 0.7, 0.001, 0.05); this.burst(d, 'lowpass', 700, 1, 0.3, 0.001, 0.05); break; }
      case 'click': { const d = this.spatial(x, y, z, 2); this.burst(d, 'highpass', 3000, 1, 0.16 * volume, 0.001, 0.02); break; }
      case 'twig': { const d = this.spatial(x, y, z, 12); this.burst(d, 'bandpass', 2600, 3, 0.5 * volume, 0.001, 0.03); break; }
      case 'ignite': { const d = this.spatial(x, y, z, 6); this.burst(d, 'bandpass', 900, 0.6, 0.5, 0.05, 0.7, 2600); break; }
      case 'feed': { const d = this.spatial(x, y, z, 5); this.burst(d, 'lowpass', 500, 1, 0.35, 0.01, 0.2); break; }
      case 'swing': { const d = this.spatial(x, y, z, 2); this.burst(d, 'bandpass', 1500, 1.2, 0.2, 0.03, 0.13, 500); break; }
      case 'hit': { const d = this.spatial(x, y, z, 4); this.burst(d, 'lowpass', 620, 1, 0.8, 0.002, 0.09); this.voice('hurt', x, y, z, 0.5, 5, 1.2); break; }
      case 'gunshot': { const d = this.spatial(x, y, z, 60); this.burst(d, 'lowpass', 2400, 0.7, 1.4, 0.001, 0.32); this.burst(d, 'highpass', 900, 1, 0.5, 0.001, 0.05); break; }
      case 'shutter': { const d = this.spatial(x, y, z, 2); this.burst(d, 'highpass', 2200, 1, 0.25, 0.001, 0.03); this.burst(d, 'bandpass', 800, 2, 0.2, 0.05, 0.1); break; }
      case 'thud': { const d = this.spatial(x, y, z, 14); this.burst(d, 'lowpass', 200, 1, 1, 0.005, 0.28); break; }
      case 'crash': { const d = this.spatial(x, y, z, 30); this.burst(d, 'lowpass', 420, 0.8, 1.2, 0.004, 0.9); this.burst(d, 'bandpass', 1500, 1, 0.5, 0.01, 0.35); break; }
      case 'thunder': { const d = this.spatial(x, y, z, 300); this.burst(d, 'lowpass', 160, 0.6, 2.2, 0.02, 3.4); this.burst(d, 'highpass', 1600, 0.7, 0.7, 0.001, 0.2); break; }
      case 'quake': { const d = this.spatial(x, y, z, 60); this.burst(d, 'lowpass', 70, 1, 1.8 * volume, 0.5, 2.6); break; }
      case 'splash': { const d = this.spatial(x, y, z, 12); this.burst(d, 'bandpass', 900, 0.5, 0.5, 0.01, 0.42, 300); break; }
      case 'bellow': this.voice('trex', x, y, z, 1.2 * volume, 34, 1.5); break;
      case 'screech': this.voice('raptor', x, y, z, 1.5 * volume, 70, 0.55); break;
      case 'radio_voice': { const d = this.spatial(x, y, z, 3); this.burst(d, 'bandpass', 1400, 4, 0.12, 0.2, 2.8); break; }
    }
  }

  /** Recorded crackle, moved to the nearest fire and faded by distance through the panner. */
  fireLoop(x: number, y: number, z: number, on: boolean) {
    if (!this.fireNode && this.fireBuffer) {
      const gain = this.ctx.createGain(); gain.gain.value = 0;
      const panner = this.ctx.createPanner(); panner.panningModel = 'HRTF'; panner.refDistance = 2.4; panner.rolloffFactor = 1.3;
      const src = this.ctx.createBufferSource(); src.buffer = this.fireBuffer; src.loop = true;
      const level = this.ctx.createGain(); level.gain.value = Math.min(5, 0.12 / Math.max(1e-4, rms(this.fireBuffer)));
      src.connect(level); level.connect(gain); gain.connect(panner); panner.connect(this.sfx); src.start();
      this.fireNode = { gain, panner };
    }
    const n = this.fireNode;
    if (!n) return;
    n.panner.positionX.value = x; n.panner.positionY.value = y; n.panner.positionZ.value = z;
    n.gain.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.4);
  }

  /** Level of the final mix, for checking the balance without ears on it. */
  meter(seconds: number) {
    const a = this.ctx.createAnalyser(); a.fftSize = 8192; this.master.connect(a);
    const data = new Float32Array(a.fftSize);
    let sum = 0, peak = 0, n = 0;
    const until = performance.now() + seconds * 1000;
    return new Promise<{ rms: number; peak: number }>((done) => {
      const id = setInterval(() => {
        a.getFloatTimeDomainData(data);
        for (const v of data) { sum += v * v; peak = Math.max(peak, Math.abs(v)); n++; }
        if (performance.now() > until) { clearInterval(id); a.disconnect(); done({ rms: Math.sqrt(sum / n), peak }); }
      }, 100);
    });
  }
}
