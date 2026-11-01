<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { CLUES, ITEMS, MISSIONS, RECIPES, SIDES, recipeVisible, type InvSlot, type ItemId } from '@dino/shared';
import { useGame } from '../stores/game.ts';
import Help from './Help.vue';
import Sensitivity from './Sensitivity.vue';
const g = useGame();
const emit = defineEmits<{ craft: [id: ItemId]; fire: []; resume: []; quit: []; tips: [on: boolean]; use: [slot: number]; move: [from: number, to: number]; drop: [slot: number] }>();
const helpTab = ref<'play' | 'controls'>('play');
const openHelp = (t: 'play' | 'controls') => { helpTab.value = t; g.panel = 'help'; };
const have = (id: string) => g.slots.reduce((a, s) => a + (s?.id === id ? s.n : 0), 0);
const canMake = (r: (typeof RECIPES)[number]) => Object.entries(r.needs).every(([k, n]) => have(k) >= Math.max(1, n as number));
const recipes = computed(() => RECIPES.filter((r) => recipeVisible(r, g.missionIndex, g.journal)));
const STATION: Record<string, string> = { fire: 'at a fire', furnace: 'at the furnace' };
const needs = (r: (typeof RECIPES)[number]) => Object.entries(r.needs).map(([k, n]) => ((n as number) > 0 ? `${n} ${ITEMS[k as ItemId].name.toLowerCase()}` : `a ${ITEMS[k as ItemId].name.toLowerCase()}`)).join(', ');
const canFire = computed(() => have('tinder') >= 2 && have('branch') + have('wood') >= 3);
const clues = computed(() => g.journal.map((id) => CLUES[id]).filter(Boolean).reverse());
const leads = computed(() => {
  const chapter = MISSIONS[Math.min(g.missionIndex, MISSIONS.length - 1)].chapter;
  return SIDES.filter((q) => q.chapter <= chapter && (!q.soloOnly || g.roster.length <= 1)).map((q) => ({ ...q, done: g.sides.includes(q.id) }));
});
const beltItem = (i: number) => g.belt[i];
const count = (id: ItemId) => have(id);

/** Dragging: pointer events rather than HTML drag and drop, so it works the same with the mouse released from the game. */
type Drag = { from: 'pack' | 'belt'; index: number; id: ItemId; name: string; x: number; y: number; moved: boolean };
const drag = ref<Drag | null>(null);
const over = ref<{ to: 'pack' | 'belt' | 'trash'; index: number } | null>(null);
const begin = (e: PointerEvent, from: 'pack' | 'belt', index: number, s: { id: ItemId } | ItemId | null) => {
  const id = (typeof s === 'string' ? s : s?.id) as ItemId | undefined;
  if (!id || e.button !== 0) return;
  e.preventDefault();
  drag.value = { from, index, id, name: ITEMS[id].name, x: e.clientX, y: e.clientY, moved: false };
  addEventListener('pointermove', follow);
  addEventListener('pointerup', drop);
};
const follow = (e: PointerEvent) => {
  const d = drag.value;
  if (!d) return;
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true;
  d.x = e.clientX; d.y = e.clientY;
  const t = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-to]');
  over.value = t ? { to: t.dataset.to as 'pack' | 'belt' | 'trash', index: Number(t.dataset.index) } : null;
};
const drop = () => {
  removeEventListener('pointermove', follow);
  removeEventListener('pointerup', drop);
  const d = drag.value, o = over.value;
  drag.value = null; over.value = null;
  if (!d || !d.moved) return;
  if (o?.to === 'trash') { if (d.from === 'pack' && !ITEMS[d.id].key) emit('drop', d.index); return; }
  if (o?.to === 'belt') g.setBelt(o.index, d.id);
  else if (d.from === 'belt') g.clearBelt(d.index); // dragged off the bar
  else if (o?.to === 'pack' && o.index !== d.index) emit('move', d.index, o.index);
};
onUnmounted(() => { removeEventListener('pointermove', follow); removeEventListener('pointerup', drop); });
/** Empty slots past the last full row are noise. One spare row stays, to drag into. */
const shownSlots = computed(() => {
  const last = g.slots.reduce((a, q, i) => (q ? i : a), -1), rows = Math.ceil((last + 1) / 3) + 1;
  return Array.from({ length: Math.min(g.slots.length, rows * 3) }, (_, i) => i);
});
const useLabel = (s: InvSlot | null | undefined) => (s ? ITEMS[s.id].use?.label ?? '' : '');
</script>

<template>
  <div class="overlay" @click.self="emit('resume')">
    <div v-if="g.panel === 'pack'" class="sheet wide">
      <div class="side">
      <h2>Item bar</h2>
      <p class="hint">Drag anything from your pack onto the bar. Keys 1 to 6 follow the order you set. Drag an item off the bar to clear it.</p>
      <div class="bar-row">
        <div v-for="i in g.belt.length" :key="i" class="bcell" :class="{ over: over?.to === 'belt' && over.index === i - 1, filled: beltItem(i - 1), gone: beltItem(i - 1) && !count(beltItem(i - 1)!) }" :data-to="'belt'" :data-index="i - 1" @pointerdown="begin($event, 'belt', i - 1, beltItem(i - 1))">
          <small>{{ i }}</small><span>{{ beltItem(i - 1) ? ITEMS[beltItem(i - 1)!].name : '' }}</span>
        </div>
      </div>
      <h2>Pack</h2>
      <div class="trash" :class="{ over: over?.to === 'trash' }" data-to="trash" data-index="0">Drag here to leave it behind</div>
      <div class="grid">
        <div v-for="i in shownSlots" :key="i" class="cell" :class="{ over: over?.to === 'pack' && over.index === i, item: g.slots[i] }" :data-to="'pack'" :data-index="i" @pointerdown="begin($event, 'pack', i, g.slots[i])">
          <template v-for="s in [g.slots[i]]" :key="i"><template v-if="s"><b>{{ ITEMS[s.id].name }}</b><small>{{ s.n > 1 ? `× ${s.n} · ` : '' }}{{ ITEMS[s.id].desc }}</small><i v-if="s.wear !== undefined && s.wear < 1" class="wear"><u :style="{ width: s.wear * 100 + '%' }" /></i><button v-if="useLabel(s)" class="use" @pointerdown.stop @click="emit('use', i)">{{ useLabel(s) }}</button></template></template>
        </div>
      </div>
      </div>
      <div class="side">
      <h2>Make</h2>
      <div class="make">
        <button v-for="r in recipes" :key="r.id" :class="{ next: g.nextCraft === r.id }" :disabled="!canMake(r)" @click="emit('craft', r.id)"><b>{{ r.label }}</b><small>{{ needs(r) }}{{ r.station && STATION[r.station] ? ` ${STATION[r.station]}` : '' }}{{ r.seconds ? ` · ${r.seconds}s` : '' }}{{ r.noise > 5 ? ` · heard at ${r.noise} m` : '' }}</small></button>
        <button :disabled="!canFire" @click="emit('fire')"><b>Lay a fire here</b><small>2 dry tinder, 3 wood or branches · 5s</small></button>
      </div>
      </div>
      <div v-if="drag && drag.moved" class="ghost" :style="{ left: drag.x + 'px', top: drag.y + 'px' }">{{ drag.name }}</div>
    </div>
    <div v-else-if="g.panel === 'journal'" class="sheet paper">
      <h2>Field journal</h2>
      <p v-if="!clues.length" class="empty">Nothing written yet.</p>
      <div v-if="leads.length" class="leads">
        <h3>Things worth doing</h3>
        <p v-for="q in leads" :key="q.id" :class="{ done: q.done }"><b>{{ q.title }}.</b> {{ q.hint }}</p>
      </div>
      <article v-for="c in clues" :key="c.id"><h3>{{ c.title }}</h3><p>{{ c.body }}</p></article>
    </div>
    <Help v-else-if="g.panel === 'help'" :key="helpTab" :tab="helpTab" @close="g.panel = 'pause'" />
    <div v-else class="sheet small">
      <h2>Paused</h2>
      <p class="hint">The world keeps running while you read this.</p>
      <button @click="emit('resume')">Back to the game</button>
      <button @click="openHelp('play')">How to play</button>
      <button @click="openHelp('controls')">Controls</button>
      <Sensitivity />
      <label class="check"><input type="checkbox" :checked="g.tipsOn" @change="emit('tips', ($event.target as HTMLInputElement).checked)" /> Show tips and markers</label>
      <button @click="emit('quit')">Leave to menu</button>
    </div>
  </div>
</template>

<style scoped>
.overlay { background: rgba(0,0,0,0.52); padding: 20px; }
.sheet { width: min(780px, 100%); max-height: 86vh; overflow: auto; background: var(--panel); border: 1px solid var(--line); padding: 22px 26px; }
.sheet.small { width: 340px; display: grid; gap: 10px; }
.sheet.wide { width: min(1120px, 100%); display: grid; grid-template-columns: 1.15fr 1fr; gap: 28px; align-items: start; }
@media (max-width: 860px) { .sheet.wide { grid-template-columns: 1fr; } }
h2 { font-weight: 400; letter-spacing: .08em; margin: 4px 0 12px; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.cell { position: relative; min-height: 60px; border: 1px solid var(--line); padding: 7px; display: grid; gap: 3px; align-content: start; user-select: none; }
.cell.item { cursor: grab; }
.cell.over, .bcell.over { border-color: #f0d9a4; background: rgba(240,217,164,.09); }
.use { position: absolute; right: 5px; bottom: 5px; padding: 1px 8px; font-size: 12px; }
.wear { display: block; height: 2px; background: rgba(233,225,207,.12); }
.wear u { display: block; height: 100%; background: rgba(233,225,207,.65); text-decoration: none; }
.trash { border: 1px dashed var(--line); color: var(--dim); font-size: 12px; text-align: center; padding: 6px; margin-bottom: 6px; }
.trash.over { border-color: #c8402b; color: #ffb4a4; }
.bar-row { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; margin-bottom: 14px; }
.bcell { position: relative; height: 58px; border: 1px dashed var(--line); padding: 16px 5px 3px; font-size: 12px; text-align: center; line-height: 1.15; user-select: none; }
.bcell.filled { border-style: solid; cursor: grab; }
.bcell.gone span { color: var(--dim); }
.bcell small { position: absolute; left: 5px; top: 2px; color: var(--dim); }
.ghost { position: fixed; z-index: 60; pointer-events: none; transform: translate(-50%, -120%); padding: 4px 10px; font-size: 13px; background: var(--panel); border: 1px solid #f0d9a4; }
.leads p { margin: 3px 0; }
.leads p.done { text-decoration: line-through; opacity: .55; }
.cell small, .make small { color: var(--dim); font-size: 12px; line-height: 1.25; }
.make { display: grid; gap: 6px; }
.make button { text-align: left; display: grid; gap: 3px; }
.make button.next { border-color: #f0d9a4; box-shadow: 0 0 0 1px rgba(240,217,164,.45), 0 0 14px rgba(240,217,164,.2); }
.paper { background: #d9cdb1; color: #2a2318; border-color: #6e6048; }
.paper h3 { margin: 16px 0 4px; font-weight: 700; }
.paper p { margin: 0; line-height: 1.5; }
.empty, .hint { color: var(--dim); margin: 0; }
.check { display: flex; align-items: center; gap: 9px; color: var(--dim); font-size: 14px; }
</style>
