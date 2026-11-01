<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ITEMS } from '@dino/shared';
import { useGame } from '../stores/game.ts';
import { overlay } from './overlay.ts';
const g = useGame();
const emit = defineEmits<{ chat: [text: string] }>();
const draft = ref('');
const sendChat = () => { emit('chat', draft.value); draft.value = ''; };
const now = ref(performance.now());
const marker = ref<HTMLElement>(), markerLabel = ref<HTMLElement>();
let raf = 0;
const tick = () => { now.value = performance.now(); raf = requestAnimationFrame(tick); };
onMounted(() => { tick(); overlay.marker = marker.value ?? null; overlay.markerLabel = markerLabel.value ?? null; });
onUnmounted(() => { cancelAnimationFrame(raf); overlay.marker = null; overlay.markerLabel = null; });
const work = computed(() => (g.workLabel ? Math.min(1, (now.value - g.workStarted) / (g.workSeconds * 1000)) : 0));
// How far your last sound carried, as a fading ring around the sight.
const ring = computed(() => { const age = (now.value - g.noiseAt) / 1400; return age < 1 ? { size: 14 + g.noiseRing * 3.4, opacity: (1 - age) * 0.6 } : null; });
const bars = computed(() => [
  { k: 'Health', v: g.health, warn: 35 }, { k: 'Stamina', v: g.stamina, warn: 20 }, { k: 'Hunger', v: g.hunger, warn: 20 }, { k: 'Thirst', v: g.thirst, warn: 20 }, { k: 'Warmth', v: g.heat, warn: 25 },
  ...(g.fever > 8 ? [{ k: 'Fever', v: 100 - g.fever, warn: 50 }] : []),
]);
const clock = computed(() => g.phase === 'dusk' ? 'Dusk' : g.phase === 'night' ? 'Night' : g.phase === 'dawn' ? 'Dawn' : '');
const heldId = computed(() => (g.held >= 0 ? g.slots[g.held]?.id ?? '' : ''));
const belt = computed(() => g.belt.map((id, i) => {
  if (!id) return { i, id: null, name: '', n: 0, wear: 1, on: false };
  const stacks = g.slots.filter((s) => s?.id === id);
  const wear = stacks[0]?.wear;
  const n = stacks.reduce((a, s) => a + (s?.n ?? 0), 0);
  // The camera shows what is left on the roll.
  return { i, id, name: ITEMS[id].name, n: id === 'camera' && n ? g.film + 1 : n, wear: wear ?? 1, on: heldId.value === id };
}));
const hit = computed(() => Math.max(0, 1 - (now.value - g.hitAt) / 260));
const dial = computed(() => `rotate(${(-g.widget.angle * 180) / Math.PI}deg)`);
</script>

<template>
  <div class="hud">
    <div class="obj">
      <b>{{ g.objective }}</b>
      <span>{{ g.objectiveHow }}</span>
      <ul v-if="g.steps.length">
        <li v-for="s in g.steps" :key="s.text" :class="{ done: s.done }">{{ s.text }}</li>
      </ul>
    </div>

    <div v-if="g.banner.id" :key="g.banner.id" class="banner">
      <h2>{{ g.banner.title }}</h2>
      <p>{{ g.banner.how }}</p>
    </div>

    <div ref="marker" class="marker"><i /><span ref="markerLabel" /></div>

    <div class="bars">
      <em v-if="clock">{{ clock }}</em>
      <div v-for="b in bars" :key="b.k" class="bar" :class="{ low: b.v < b.warn }"><label>{{ b.k }}</label><i :style="{ width: b.v + '%' }" /></div>
    </div>
    <div class="dot" :class="{ hit: hit > 0 }" :style="hit > 0 ? { opacity: hit } : undefined" />
    <div v-if="g.widget.kind === 'compass'" class="compass"><i :style="{ transform: dial }" /></div>
    <div v-if="g.widget.kind === 'signal'" class="signal"><span>{{ g.widget.text || 'Static' }}</span><i :style="{ width: g.widget.strength * 100 + '%' }" /></div>
    <i v-if="ring" class="ring" :style="{ width: ring.size + 'px', height: ring.size + 'px', opacity: ring.opacity }" />
    <span v-for="p in g.pings" :key="p.id" class="ping" :class="p.kind" :style="{ left: p.x + '%', top: p.y + '%' }">{{ p.kind }}</span>
    <form v-if="g.chatting" class="say" @submit.prevent="sendChat"><input v-model="draft" autofocus maxlength="200" placeholder="Say something. It makes no noise." @keydown.esc="sendChat" /></form>
    <div v-if="g.prompt" class="prompt"><kbd>E</kbd> {{ g.prompt }}</div>
    <div v-if="g.workLabel" class="work"><span>{{ g.workLabel }}</span><i :style="{ width: work * 100 + '%' }" /></div>
    <div v-if="g.line" class="line">{{ g.line }}</div>
    <div v-if="g.tip" :key="g.tipId" class="tip">{{ g.tip }}</div>
    <div class="belt">
      <div v-for="s in belt" :key="s.i" class="slot" :class="{ on: s.on, out: s.id && !s.n }"><small>{{ s.i + 1 }}</small>{{ s.name }}<b v-if="s.n > 1">{{ s.id === 'camera' ? s.n - 1 : s.n }}</b><u v-if="s.wear < 1 && s.n" :style="{ width: s.wear * 100 + '%' }" /></div>
    </div>
    <div v-if="g.partyCode" class="party">Invite code {{ g.partyCode }} · {{ g.roster.length }}/4</div>
    <div class="chat"><p v-for="(c, i) in g.chat" :key="i"><b>{{ c.from }}:</b> {{ c.text }}</p></div>
    <div v-if="g.showStats" class="stats">{{ g.stats.fps }} fps · {{ (g.stats.tris / 1e6).toFixed(2) }}M tris · {{ g.stats.calls }} calls · {{ g.stats.backend }} · {{ g.stats.preset }}</div>
    <div v-if="!g.locked && !g.panel && !g.knapping && !g.chatting" class="grab">Click to take control</div>
  </div>
</template>

<style scoped>
.hud { position: fixed; inset: 0; pointer-events: none; z-index: 5; text-shadow: 0 1px 3px rgba(0,0,0,0.95); }
.obj { position: absolute; top: 20px; left: 26px; max-width: 340px; display: grid; gap: 3px; }
.obj b { font-size: 18px; font-weight: 400; letter-spacing: 0.03em; }
.obj span { font-size: 13px; color: #c9c0ad; line-height: 1.35; }
.obj ul { list-style: none; margin: 7px 0 0; padding: 0; display: grid; gap: 3px; font-size: 13px; }
.obj li { color: #e9e1cf; padding-left: 16px; position: relative; }
.obj li::before { content: ''; position: absolute; left: 2px; top: 5px; width: 7px; height: 7px; border: 1px solid rgba(233,225,207,.7); }
.obj li.done { color: rgba(233,225,207,.5); text-decoration: line-through; }
.obj li.done::before { background: rgba(233,225,207,.6); }

.banner { position: absolute; left: 50%; top: 34%; transform: translateX(-50%); width: min(820px, 90vw); padding: 26px 40px; text-align: center; opacity: 0; animation: banner 5.2s ease both; background: radial-gradient(ellipse closest-side, rgba(0,0,0,.62), rgba(0,0,0,.34) 62%, transparent); text-shadow: 0 1px 8px #000, 0 0 2px #000; }
.banner h2 { font-weight: 400; font-size: clamp(30px, 4.4vw, 50px); letter-spacing: 0.06em; margin: 0; color: #f4eddc; }
.banner p { font-size: clamp(15px, 1.6vw, 19px); color: #d9d0bc; margin: 10px 0 0; line-height: 1.4; }
@keyframes banner { 0% { opacity: 0; transform: translate(-50%, 8px); } 9% { opacity: 1; transform: translate(-50%, 0); } 78% { opacity: 1; } 100% { opacity: 0; } }

.marker { position: absolute; left: 0; top: 0; opacity: 0; transition: opacity .35s; display: grid; justify-items: center; gap: 4px; will-change: transform; }
.marker i { width: 11px; height: 11px; border: 1.5px solid #f0d9a4; transform: rotate(45deg); box-shadow: 0 0 8px rgba(240,217,164,.55); }
.marker span { font-size: 12px; color: #f0e4c8; white-space: nowrap; }

.bars { position: absolute; left: 26px; bottom: 24px; width: 180px; display: grid; gap: 5px; }
.bars em { font-size: 13px; color: #d9d0bc; }
.bar { position: relative; height: 15px; background: rgba(0,0,0,0.35); }
.bar label { position: absolute; left: 5px; top: 0; font-size: 11px; line-height: 15px; color: rgba(233,225,207,.82); }
.bar i { display: block; height: 100%; background: rgba(233, 225, 207, 0.22); }
.bar.low i { background: rgba(170, 45, 28, 0.75); }
.dot { position: absolute; left: 50%; top: 50%; width: 3px; height: 3px; margin: -1.5px; background: rgba(255,255,255,.55); border-radius: 50%; }
.ring { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); border: 1px solid rgba(233,225,207,.9); border-radius: 50%; }
.ping { position: absolute; transform: translate(-50%, -50%); font-size: 13px; padding: 1px 7px; border: 1px solid rgba(233,225,207,.7); background: rgba(0,0,0,.45); }
.ping.danger { border-color: #c8402b; color: #ffb4a4; }
.say { position: absolute; left: 26px; bottom: 190px; pointer-events: auto; }
.say input { width: 340px; }
.prompt { position: absolute; left: 50%; top: 55%; transform: translateX(-50%); font-size: 16px; white-space: nowrap; padding: 4px 10px; background: rgba(0,0,0,.34); }
kbd { border: 1px solid rgba(233,225,207,.7); padding: 1px 6px; font: inherit; font-size: 13px; }
.work { position: absolute; left: 50%; top: 61%; width: 240px; transform: translateX(-50%); text-align: center; font-size: 14px; }
.work i { display: block; height: 2px; margin-top: 6px; background: #e9e1cf; }
.line { position: absolute; left: 50%; bottom: 20%; transform: translateX(-50%); font-size: 18px; font-style: italic; max-width: 70vw; text-align: center; }
.tip { position: absolute; left: 50%; bottom: 13%; transform: translateX(-50%); font-size: 15px; color: #f0e4c8; padding: 6px 14px; background: rgba(0,0,0,.42); max-width: 76vw; text-align: center; animation: tip .4s ease both; }
@keyframes tip { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }
.belt { position: absolute; left: 222px; bottom: 24px; display: grid; grid-template-columns: repeat(6, 74px); gap: 4px; }
.slot { position: relative; height: 54px; background: rgba(0,0,0,0.35); border: 1px solid rgba(233,225,207,.12); font-size: 11px; padding: 15px 4px 2px; text-align: center; line-height: 1.1; overflow: hidden; }
.slot.on { border-color: rgba(233,225,207,.7); }
.slot.out { color: rgba(233,225,207,.35); }
.slot small { position: absolute; left: 4px; top: 2px; color: var(--dim); }
.slot b { position: absolute; right: 4px; top: 2px; }
.slot u { position: absolute; left: 0; bottom: 0; height: 2px; background: rgba(233,225,207,.65); text-decoration: none; }
.dot.hit { width: 9px; height: 9px; margin: -4.5px; background: #e05a3a; }
.compass { position: absolute; left: 50%; bottom: 11%; width: 74px; height: 74px; margin-left: -37px; border: 1px solid rgba(233,225,207,.5); border-radius: 50%; background: rgba(0,0,0,.35); }
.compass i { position: absolute; left: 50%; top: 9px; width: 2px; height: 28px; margin-left: -1px; background: #e0634a; transform-origin: 1px 28px; }
.signal { position: absolute; left: 50%; bottom: 12%; width: 280px; margin-left: -140px; text-align: center; font-size: 14px; }
.signal i { display: block; height: 3px; margin-top: 6px; background: #d9c98a; }
.party { position: absolute; top: 22px; right: 26px; font-size: 14px; }
.chat { position: absolute; left: 26px; bottom: 216px; font-size: 13px; }
.chat p { margin: 2px 0; }
.stats { position: absolute; top: 50px; right: 26px; font-size: 12px; font-family: monospace; }
.grab { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); font-size: 20px; padding: 10px 20px; background: rgba(0,0,0,.6); border: 1px solid var(--line); }
</style>
