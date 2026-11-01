/** HUD state. The engine pushes a small snapshot a few times per second, never per frame. */
import { defineStore } from 'pinia';
import { BELT_SLOTS, ITEMS, type EnvView, type InvSlot, type ItemId, type SpotView, type StepView, type WidgetView } from '@dino/shared';

export type Screen = 'menu' | 'loading' | 'play' | 'dead' | 'end';

export const SENS_MIN = 20, SENS_MAX = 300;
const readSens = () => { try { const v = Number(localStorage.getItem('dh.sens')); return v >= SENS_MIN && v <= SENS_MAX ? v : 100; } catch { return 100; } };

const BELT_KEY = 'dh.belt';
const emptyBelt = (): (ItemId | null)[] => new Array(BELT_SLOTS).fill(null);
const readBelt = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(BELT_KEY) ?? 'null') as { belt: (ItemId | null)[]; seen: ItemId[] } | null;
    if (raw && Array.isArray(raw.belt)) return { belt: emptyBelt().map((_, i) => (raw.belt[i] && ITEMS[raw.belt[i]!] ? raw.belt[i] : null)), seen: raw.seen ?? [] };
  } catch { /* private mode, or an old format */ }
  return { belt: emptyBelt(), seen: [] as ItemId[] };
};
const saved = readBelt();

export const useGame = defineStore('game', {
  state: () => ({
    screen: 'menu' as Screen,
    loadPct: 0, loadLabel: '', error: '',
    objective: '', objectiveHow: '', objectiveFlash: 0, missionIndex: 0,
    banner: { id: 0, title: '', how: '' },
    steps: [] as { text: string; done: boolean }[],
    tip: '', tipId: '', tipsOn: true,
    sens: readSens(),
    nextCraft: '',
    locked: true,
    prompt: '', line: '', lineUntil: 0,
    health: 100, stamina: 100, hunger: 100, thirst: 100, heat: 100, fear: 0, battery: 100, bleeding: 0, downed: 0,
    noiseRing: 0, noiseAt: 0,
    chatting: false, pings: [] as { x: number; y: number; kind: string; id: number }[],
    phase: 'day', timeLabel: '',
    slots: [] as (InvSlot | null)[], held: -1,
    /** The bottom-left bar. Each place holds a kind of item, chosen and ordered by the player. */
    belt: saved.belt, beltSeen: saved.seen,
    how: '', serverSteps: [] as StepView[],
    spots: [] as SpotView[],
    sides: [] as string[],
    env: { star: 0, copper: 0, aurora: 0, ash: 0, flood: 0, quake: 0, storm: 0, rift: 0, day: 0, era: 0 } as EnvView,
    widget: { kind: '', angle: 0, strength: 0 } as WidgetView,
    fever: 0, film: 15, hitAt: 0, ending: '', hasSave: false,
    panel: '' as '' | 'pack' | 'journal' | 'pause' | 'help',
    journal: [] as string[],
    workLabel: '', workSeconds: 0, workStarted: 0,
    knapping: false,
    partyCode: '', roster: [] as { id: number; name: string; character: number }[],
    chat: [] as { from: string; text: string }[],
    polaroid: '', deathCause: '', deathDate: '', respawnAt: 0, dying: false,
    stats: { fps: 0, frame: 0, tris: 0, calls: 0, backend: '', preset: '' },
    showStats: false,
  }),
  actions: {
    saveBelt() { try { localStorage.setItem(BELT_KEY, JSON.stringify({ belt: this.belt, seen: this.beltSeen })); } catch { /* private mode */ } },
    /** A kind of item seen for the first time takes the next free place. After that the player is in charge. */
    syncBelt() {
      let changed = false;
      for (const s of this.slots) {
        if (!s || this.beltSeen.includes(s.id)) continue;
        this.beltSeen = [...this.beltSeen, s.id];
        changed = true;
        const d = ITEMS[s.id];
        if (d.key || !(d.tool || d.weapon || d.use)) continue;
        const free = this.belt.indexOf(null);
        if (free >= 0 && !this.belt.includes(s.id)) this.belt[free] = s.id;
      }
      if (changed) this.saveBelt();
    },
    /** Puts an item at a place on the bar, swapping with whatever is there. */
    setBelt(at: number, id: ItemId | null) {
      const was = id ? this.belt.indexOf(id) : -1;
      if (was >= 0) this.belt[was] = this.belt[at];
      this.belt[at] = id;
      this.saveBelt();
    },
    clearBelt(at: number) { this.belt[at] = null; this.saveBelt(); },
    packSlot(id: ItemId) { return this.slots.findIndex((s) => s?.id === id); },
  },
});
