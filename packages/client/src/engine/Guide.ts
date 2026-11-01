/**
 * The tutorial, kept out of the way. Three rules:
 *  - Say what to do only when it is relevant, and stop the moment the player has done it.
 *  - Never repeat a tip, even across sessions.
 *  - Show the way when asked for, or when the player has clearly stalled. Otherwise stay quiet.
 */
import * as THREE from 'three/webgpu';
import { MISSIONS, phaseName, type ItemId, type NodeKind, type ResourceNode } from '@dino/shared';
import { overlay } from '../ui/overlay.ts';
import type { useGame } from '../stores/game.ts';
import type { WorldData } from './world.ts';

type Store = ReturnType<typeof useGame>;
interface Point { x: number; y: number; z: number }
interface Target extends Point { label: string }

/** What the guide may read from the running game. */
export interface GuideHost {
  store: Store;
  world: WorldData;
  camera: THREE.Camera;
  me: Point;
  nodes(): IterableIterator<{ node: ResourceNode }>;
  hasProp(id: string): boolean;
  firePlaced(): Point | null;
  fireLit(): (Point & { fuel: number }) | null;
  nearestOther(): Point | null;
  nearestDino(): number;
  underRock(): boolean;
  dayT(): number;
  stat: () => { thirst: number; heat: number; battery: number };
  world2: () => WorldData;
}

interface Tip { id: string; text: string; when: () => boolean; done?: () => boolean; delay?: number }

const STORE_KEY = 'dh.tips.seen';
const readSeen = () => { try { return new Set<string>(JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]')); } catch { return new Set<string>(); } };
const writeSeen = (s: Set<string>) => { try { localStorage.setItem(STORE_KEY, JSON.stringify([...s])); } catch { /* private mode */ } };
export const resetTips = () => { try { localStorage.removeItem(STORE_KEY); } catch { /* private mode */ } };

const STALL_SECONDS = 40;

export class Guide {
  private seen = readSeen();
  private tips: Tip[];
  private pending = new Map<string, number>();
  private active: Tip | null = null;
  private activeUntil = 0;
  private cooldown = 0;
  private played = 0;
  private moved = 0;
  private last: Point | null = null;
  private since = 0; // seconds without progress on the current step
  private lastKey = '';
  private lastInv = -1;
  private revealUntil = 0;
  private target: Target | null = null;
  glints: Point[] = [];
  private v = new THREE.Vector3();
  /** Things the player has shown they know. */
  did = { light: false, pack: false, journal: false, sprint: false, crouch: false, chop: false, help: false, strike: false };

  constructor(private h: GuideHost) {
    const s = h.store;
    const have = (id: ItemId) => this.have(id);
    const outdoors = () => !h.underRock();
    this.tips = [
      { id: 'move', text: 'W A S D to move. Move the mouse to look.', delay: 6, when: () => this.moved < 1, done: () => this.moved > 2 },
      { id: 'light', text: 'F switches the flashlight. The batteries will not come back.', delay: 5, when: () => have('flashlight') > 0, done: () => this.did.light },
      { id: 'pack', text: 'Tab opens your pack. Everything you can make is listed there.', delay: 2, when: () => this.gathered() > 0, done: () => this.did.pack },
      { id: 'journal', text: 'That went in your journal. J to read it.', delay: 3, when: () => s.journal.length > 0, done: () => this.did.journal },
      { id: 'run', text: 'Hold Shift to run. Running is loud, and worse on gravel.', delay: 16, when: () => outdoors() && this.moved > 5, done: () => this.did.sprint },
      { id: 'crouch', text: 'C to crouch. Crouching makes no sound at all.', delay: 2, when: () => h.nearestDino() < 70, done: () => this.did.crouch },
      { id: 'loud', text: 'That ring shows how far your last sound carried.', delay: 0.3, when: () => s.noiseRing >= 15 && performance.now() - s.noiseAt < 1500 },
      { id: 'weapon', text: 'A branch and your pocketknife make a sharpened stick. Tab to make one. It is weak, but it works.', delay: 3, when: () => have('branch') > 0 && s.missionIndex >= 3 && !have('spike'), done: () => have('spike') > 0 },
      { id: 'strike', text: 'Left click strikes with what you hold. It will not win a fight, only buy a second.', delay: 1, when: () => have('spike') + have('hand_axe') > 0 && h.nearestDino() < 40, done: () => this.did.strike },
      { id: 'bar', text: 'Tab, then drag items onto the bar to choose what keys 1 to 6 hold.', delay: 8, when: () => s.slots.filter(Boolean).length > 5 && s.panel === '', done: () => s.belt.every(Boolean) },
      { id: 'chop', text: 'With the axe, press E at a tree for firewood. Each hit carries 40 m.', delay: 4, when: () => have('hand_axe') > 0 && s.missionIndex >= 7, done: () => this.did.chop },
      { id: 'thirst', text: 'You are getting thirsty. Press E at the water to drink.', delay: 1, when: () => h.stat().thirst < 32 },
      { id: 'cold', text: 'You are freezing. Get close to a fire.', delay: 1, when: () => h.stat().heat < 30 },
      { id: 'dusk', text: 'The light is going. Get back to the cave.', delay: 0.5, when: () => phaseName(h.dayT()) === 'dusk' && outdoors() },
      { id: 'firelow', text: 'The fire is dying. Press E to feed it branches or wood.', delay: 0.5, when: () => { const f = h.fireLit(); return !!f && f.fuel < 0.25; } },
      { id: 'battery', text: 'The flashlight is failing. Save what is left.', delay: 0.5, when: () => h.stat().battery < 20 },
      { id: 'help', text: 'Lost? Press H to see where to go.', delay: 0, when: () => this.since > STALL_SECONDS, done: () => this.did.help },
    ];
  }

  private have(id: ItemId) { return this.h.store.slots.reduce((a, s) => a + (s?.id === id ? s.n : 0), 0); }
  private wood() { return this.have('branch') + this.have('wood'); }
  private gathered() { return this.h.store.slots.filter((s) => s && !['canteen', 'flashlight'].includes(s.id)).length; }

  private nearest(kind: NodeKind, label: string): Target | null {
    const m = this.h.me;
    let best: ResourceNode | null = null, bd = 1e9;
    for (const { node } of this.h.nodes()) {
      if (node.kind !== kind) continue;
      const d = Math.hypot(node.x - m.x, node.z - m.z);
      if (d < bd) { bd = d; best = node; }
    }
    return best ? { x: best.x, y: best.y, z: best.z, label } : null;
  }

  private propTarget(id: string, label: string): Target | null {
    const p = this.h.world2().meta.props.find((q) => q.id === id);
    return p && this.h.hasProp(id) ? { x: p.x, y: p.y, z: p.z, label } : null;
  }

  private river(): Target {
    const m = this.h.me;
    let best = this.h.world2().meta.river[0], bd = 1e9;
    for (const p of this.h.world2().meta.river) { const d = Math.hypot(p.x - m.x, p.z - m.z) - p.w; if (d < bd) { bd = d; best = p; } }
    const l = Math.max(1, Math.hypot(best.x - m.x, best.z - m.z)), k = Math.max(0, l - best.w) / l;
    return { x: m.x + (best.x - m.x) * k, y: best.y, z: m.z + (best.z - m.z) * k, label: 'Water' };
  }

  /** Works out the current step: its checklist, where to go, and what to make next. */
  private plan() {
    const h = this.h, s = h.store, i = s.missionIndex, meta = h.world2().meta;
    const steps: { text: string; done: boolean }[] = [];
    let target: Target | null = null, how = MISSIONS[Math.min(i, MISSIONS.length - 1)].how, next = '';
    const glint: NodeKind[] = [];
    // From the pot onward the simulation writes the checklist.
    if (i >= 10) {
      const open = s.serverSteps.find((q) => !q.done);
      for (const q of s.serverSteps) { steps.push({ text: q.text, done: q.done }); if (q.glint && !q.done) glint.push(q.glint as NodeKind); }
      if (open?.at) target = { ...open.at };
      for (const q of s.serverSteps) if (!q.done && q.craft && !next) next = q.craft;
      return { steps, target, how: s.how || how, next, glint };
    }
    const fireSteps = (light: boolean) => {
      const placed = h.firePlaced(), lit = h.fireLit();
      const drill = this.have('bow_drill') > 0, rope = drill || this.have('rope') > 0;
      const tinder = this.have('tinder'), fibre = this.have('fiber'), wood = this.wood();
      const woodNeed = (placed ? 0 : 3) + (drill ? 0 : 2);
      if (!placed) steps.push({ text: `Dry tinder ${Math.min(tinder, 2)} of 2`, done: tinder >= 2 });
      if (woodNeed) steps.push({ text: `Branches ${Math.min(wood, woodNeed)} of ${woodNeed}`, done: wood >= woodNeed });
      if (!rope) steps.push({ text: `Plant fibre ${Math.min(fibre, 3)} of 3`, done: fibre >= 3 });
      if (!drill) steps.push({ text: 'Pack: Twist rope', done: rope });
      steps.push({ text: 'Pack: Make a bow drill', done: drill });
      if (!placed) steps.push({ text: 'Lay a fire in the cave mouth', done: false });
      if (light) steps.push({ text: 'Light it with the bow drill', done: !!lit });
      if (!placed && tinder < 2) { glint.push('tinder'); target ??= this.nearest('tinder', 'Dry tinder'); }
      if (wood < woodNeed) { glint.push('branch'); target ??= this.nearest('branch', 'Branches'); }
      if (!rope && fibre < 3) { glint.push('fiber'); target ??= this.nearest('fiber', 'Fern fibre'); }
      if (!rope && fibre >= 3) next = 'rope';
      else if (rope && !drill && wood >= 2) next = 'bow_drill';
      if (!target && !next) {
        if (!placed) { const f = meta.features.firePit; target = { ...f, label: 'Cave mouth' }; } else if (!lit) target = { ...placed, label: 'Your fire' };
      }
    };
    switch (i) {
      case 0: target = this.propTarget('flashlight', ''); break;
      case 1: {
        const o = h.nearestOther();
        if (o) { how = 'Follow their light and regroup.'; target = { ...o, label: 'Teammate' }; } else target = this.propTarget('dragmarks', 'Marks');
        break;
      }
      case 2: target = { x: meta.mouth.x + 18, y: meta.mouth.y + 1, z: meta.mouth.z, label: 'Daylight' }; break;
      case 3:
        if (s.journal.includes('noriver')) { how = 'Something left a mark near the water. Look closer.'; target = this.propTarget('footprint', 'Footprint'); } else target = { ...meta.features.campSite, label: 'The camp' };
        break;
      case 4:
        glint.push('flint'); target = this.nearest('flint', 'Flint');
        // With a branch in hand the first weapon is one step away.
        if (this.have('branch') > 0 && !this.have('spike')) next = 'spike';
        break;
      case 5:
        if (this.have('flint') > 0) next = 'blade'; else { how = 'That one shattered. Find more flint.'; glint.push('flint'); target = this.nearest('flint', 'Flint'); }
        break;
      case 6: {
        const branch = this.have('branch'), fibre = this.have('fiber');
        steps.push({ text: `Branch ${Math.min(branch, 1)} of 1`, done: branch >= 1 }, { text: `Plant fibre ${Math.min(fibre, 2)} of 2`, done: fibre >= 2 }, { text: 'Pack: Lash a hand axe', done: false });
        if (branch < 1) { glint.push('branch'); target = this.nearest('branch', 'Branch'); }
        if (fibre < 2) { glint.push('fiber'); target ??= this.nearest('fiber', 'Fern fibre'); }
        if (branch >= 1 && fibre >= 2) next = 'hand_axe';
        break;
      }
      case 7: {
        // Lit before dark: the sun is on its way down and a new fire will not last the night.
        if (!h.fireLit()) { fireSteps(true); break; }
        const spare = this.wood();
        how = 'It caught. Gather spare wood while you can still see.';
        steps.push({ text: `Spare wood ${Math.min(spare, 3)} of 3`, done: spare >= 3 });
        if (spare < 3) { glint.push('branch'); target = this.nearest('branch', 'Branches'); }
        break;
      }
      case 8: {
        const lit = h.fireLit();
        if (lit) {
          steps.push({ text: `Fire ${Math.round(lit.fuel * 100)}%`, done: lit.fuel > 0.3 });
          if (Math.hypot(lit.x - h.me.x, lit.z - h.me.z) > 14) target = { ...lit, label: 'Your fire' };
        } else { how = 'You have no fire. Build one, fast.'; fireSteps(true); }
        break;
      }
      case 9: target = this.river(); break;
      default: break;
    }
    return { steps, target, how, next, glint };
  }

  /** H key: show the way for a few seconds. */
  reveal() { this.did.help = true; this.revealUntil = performance.now() + 7000; }

  /** Objective changed: announce it in the middle of the screen, and show the way briefly. */
  announce(index: number, delayMs = 500) {
    const s = this.h.store, m = MISSIONS[Math.min(index, MISSIONS.length - 1)];
    s.missionIndex = index; s.objective = m.objective; s.objectiveHow = m.how; s.objectiveFlash = performance.now();
    this.since = 0;
    setTimeout(() => {
      if (s.missionIndex !== index) return;
      s.banner = { id: s.banner.id + 1, title: m.objective, how: this.plan().how };
      this.revealUntil = performance.now() + 6500;
    }, delayMs);
  }

  /** About six times a second. */
  tick(dt: number) {
    const h = this.h, s = h.store;
    this.played += dt;
    if (this.last) this.moved += Math.hypot(h.me.x - this.last.x, h.me.z - this.last.z);
    this.last = { ...h.me };

    const p = this.plan();
    s.objectiveHow = p.how;
    s.nextCraft = p.next;
    if (JSON.stringify(s.steps) !== JSON.stringify(p.steps)) s.steps = p.steps;
    this.target = p.target;

    // Anything that moved the step forward counts as progress.
    const key = `${s.missionIndex}|${p.steps.filter((q) => q.done).length}|${p.next}|${p.target?.label ?? ''}`;
    const inv = s.slots.reduce((a, q) => a + (q?.n ?? 0), 0);
    if (key !== this.lastKey || inv !== this.lastInv) { this.since = 0; this.lastKey = key; this.lastInv = inv; } else if (!s.panel) this.since += dt;

    // Glints on the nearest things this step actually needs.
    const near: (Point & { d: number })[] = [];
    if (s.tipsOn) {
      for (const { node } of h.nodes()) {
        if (!p.glint.includes(node.kind)) continue;
        const d = Math.hypot(node.x - h.me.x, node.z - h.me.z);
        if (d < 34) near.push({ x: node.x, y: node.y, z: node.z, d });
      }
      if (p.target && [0, 1, 3].includes(s.missionIndex)) near.push({ x: p.target.x, y: p.target.y, z: p.target.z, d: 0 });
    }
    this.glints = near.sort((a, b) => a.d - b.d).slice(0, 10);
    if (s.tipsOn) this.stepTips(dt); else if (s.tip) { s.tip = ''; this.active = null; }
  }

  private stepTips(dt: number) {
    const s = this.h.store, now = performance.now();
    if (this.active) {
      if (this.active.done?.() || now > this.activeUntil) { this.active = null; s.tip = ''; this.cooldown = 9; }
      return;
    }
    this.cooldown -= dt;
    for (const t of this.tips) {
      if (this.seen.has(t.id)) continue;
      // Already doing it? Then the player never needed telling.
      if (t.done?.()) { this.seen.add(t.id); writeSeen(this.seen); continue; }
      if (!t.when()) { this.pending.delete(t.id); continue; }
      const waited = (this.pending.get(t.id) ?? 0) + dt;
      this.pending.set(t.id, waited);
      if (waited < (t.delay ?? 0) || this.cooldown > 0 || s.panel || s.knapping || s.workLabel) continue;
      this.active = t; this.activeUntil = now + 7500;
      s.tip = t.text; s.tipId = t.id;
      this.seen.add(t.id); writeSeen(this.seen);
      return;
    }
  }

  /** Every frame: move the way-marker without going through Vue. */
  frame() {
    const el = overlay.marker, h = this.h, s = h.store, t = this.target;
    if (!el) return;
    const stalled = this.since > STALL_SECONDS;
    const show = !!t && (performance.now() < this.revealUntil || (stalled && s.tipsOn)) && !s.panel && !s.dying;
    if (!show) { el.style.opacity = '0'; return; }
    const dist = Math.hypot(t.x - h.me.x, t.z - h.me.z);
    if (dist < 3) { el.style.opacity = '0'; return; }
    const v = this.v.set(t.x, t.y + 0.4, t.z).project(h.camera);
    const behind = v.z > 1;
    let x = behind ? -v.x : v.x, y = behind ? -v.y : v.y;
    if (behind || Math.abs(x) > 0.88 || Math.abs(y) > 0.8) {
      // Off screen: pin to the edge, in the direction to turn.
      const k = 1 / Math.max(Math.abs(x) / 0.88, Math.abs(y) / 0.8, 1e-3);
      x *= k; y *= k;
    }
    el.style.opacity = '1';
    el.style.transform = `translate(calc(${((x * 0.5 + 0.5) * innerWidth).toFixed(1)}px - 50%), calc(${((0.5 - y * 0.5) * innerHeight).toFixed(1)}px - 50%))`;
    if (overlay.markerLabel) overlay.markerLabel.textContent = `${t.label ? `${t.label} · ` : ''}${Math.round(dist)} m`;
  }
}
