<script setup lang="ts">
import { computed } from 'vue';
import { ENDINGS, type EndingId } from '@dino/shared';
import { useGame } from '../stores/game.ts';
const g = useGame();
const emit = defineEmits<{ quit: [] }>();
const ending = computed(() => ENDINGS[g.ending as EndingId] ?? ENDINGS.home);
</script>

<template>
  <div v-if="g.screen === 'loading'" class="overlay load">
    <div class="l">
      <h2>{{ g.error ? 'Something went wrong' : g.loadLabel }}</h2>
      <div v-if="!g.error" class="p"><i :style="{ width: g.loadPct + '%' }" /></div>
      <p v-else class="err">{{ g.error }}</p>
      <button v-if="g.error" @click="emit('quit')">Back</button>
    </div>
  </div>
  <div v-if="g.screen === 'dead'" class="overlay dead">
    <figure class="pol">
      <img v-if="g.polaroid" :src="g.polaroid" alt="" />
      <div v-else class="blank" />
      <figcaption>{{ g.deathCause }}<br /><small>{{ g.deathDate }}</small></figcaption>
    </figure>
    <p class="wait">You will wake by the last fire.</p>
  </div>
  <div v-if="g.screen === 'end'" class="overlay end">
    <div class="l">
      <h2>{{ ending.title }}</h2>
      <p>{{ ending.body }}</p>
      <button @click="emit('quit')">Back to menu</button>
    </div>
  </div>
</template>

<style scoped>
.load { background: #000; z-index: 30; }
.l { width: min(460px, 90vw); display: grid; gap: 14px; }
h2 { font-weight: 400; margin: 0; }
.p { height: 2px; background: rgba(255,255,255,.1); }
.p i { display: block; height: 100%; background: var(--ink); transition: width .2s; }
.err { color: #d0543f; }
.dead { flex-direction: column; background: #000; z-index: 30; gap: 22px; }
.pol { background: #ece6d6; padding: 16px 16px 12px; margin: 0; transform: rotate(-2.2deg); box-shadow: 0 16px 50px rgba(0,0,0,.8); }
.pol img, .blank { display: block; width: min(420px, 74vw); aspect-ratio: 1.05; object-fit: cover; filter: sepia(.32) contrast(1.08) saturate(.8); background: #111; }
figcaption { color: #2a2318; font-family: 'Bradley Hand', 'Snell Roundhand', cursive; font-size: 22px; padding-top: 10px; text-align: center; line-height: 1.15; }
figcaption small { font-size: 16px; }
.wait { color: var(--dim); }
.end { background: rgba(0,0,0,.86); z-index: 30; }
</style>
