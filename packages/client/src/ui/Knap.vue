<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
const emit = defineEmits<{ done: [hits: number, good: number]; strike: [] }>();
const STRIKES = 5;
const pos = ref(0), target = ref(0.5), width = ref(0.16), hits = ref(0), good = ref(0), flash = ref('');
let raf = 0, t0 = performance.now();
const loop = (n: number) => { pos.value = 0.5 + 0.5 * Math.sin((n - t0) * 0.0034); raf = requestAnimationFrame(loop); };
const strike = () => {
  if (hits.value >= STRIKES) return;
  hits.value++;
  emit('strike');
  const hit = Math.abs(pos.value - target.value) < width.value / 2;
  if (hit) good.value++;
  flash.value = hit ? 'clean flake' : 'glancing blow';
  target.value = 0.15 + Math.random() * 0.7; t0 = performance.now() - Math.random() * 900;
  if (hits.value >= STRIKES) setTimeout(() => emit('done', hits.value, good.value), 420);
};
const key = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); strike(); } };
onMounted(() => { raf = requestAnimationFrame(loop); addEventListener('keydown', key); });
onUnmounted(() => { cancelAnimationFrame(raf); removeEventListener('keydown', key); });
</script>

<template>
  <div class="overlay knap" @pointerdown="strike">
    <div class="box">
      <h2>Knapping</h2>
      <p>Strike when the mark crosses the ridge. Each blow carries about 25 metres.</p>
      <div class="track"><i class="zone" :style="{ left: (target - width / 2) * 100 + '%', width: width * 100 + '%' }" /><i class="mark" :style="{ left: pos * 100 + '%' }" /></div>
      <p class="count">{{ hits }} of {{ STRIKES }} · {{ good }} clean · <em>{{ flash }}</em></p>
      <p class="small">Click or press Space. Three clean flakes make a blade.</p>
    </div>
  </div>
</template>

<style scoped>
.knap { background: rgba(0,0,0,.4); user-select: none; }
.box { width: min(520px, 92vw); background: var(--panel); border: 1px solid var(--line); padding: 20px 24px; }
h2 { font-weight: 400; margin: 0 0 8px; }
p { color: var(--dim); margin: 6px 0; }
.track { position: relative; height: 26px; background: rgba(255,255,255,.06); margin: 16px 0; }
.zone { position: absolute; top: 0; bottom: 0; background: rgba(233,225,207,.3); }
.mark { position: absolute; top: -4px; bottom: -4px; width: 3px; margin-left: -1px; background: #fff; }
.count { color: var(--ink); }
.small { font-size: 13px; }
</style>
