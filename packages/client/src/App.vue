<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue';
import type { Game } from './engine/Game.ts';
import type { ItemId, SaveData } from '@dino/shared';
import { useGame } from './stores/game.ts';
import Hud from './ui/Hud.vue';
import Knap from './ui/Knap.vue';
import Menu from './ui/Menu.vue';
import Panels from './ui/Panels.vue';
import Screens from './ui/Screens.vue';

const g = useGame();
const canvas = ref<HTMLCanvasElement>();
const game = shallowRef<Game | null>(null);
const params = new URLSearchParams(location.search);

async function start(o: { mode: 'solo' | 'host' | 'join'; code: string; server: string; name: string; character: number; preset: string; gore: boolean; photosensitive: boolean; tips: boolean; save?: SaveData }) {
  g.screen = 'loading'; g.error = ''; g.loadPct = 0;
  try {
    const { Game } = await import('./engine/Game.ts');
    const inst = new Game(canvas.value!, g, { ...o, preset: o.preset as never, forceWebGL: params.has('gl'), muted: params.has('mute') });
    game.value = inst;
    (window as unknown as Record<string, unknown>).__game = inst;
    await inst.start();
  } catch (e) {
    console.error(e);
    g.error = e instanceof Error ? e.message : String(e);
  }
}

function quit() { game.value?.dispose(); game.value = null; location.href = location.pathname; }
const resume = () => { g.panel = ''; game.value?.syncPointer(); };
const setTips = (on: boolean) => { g.tipsOn = on; try { localStorage.setItem('dh.tips', on ? '1' : '0'); } catch { /* private mode */ } };
const craft = (id: ItemId) => game.value?.craft(id);

onMounted(() => {
  if (params.has('viewer')) { g.screen = 'play'; void import('./engine/viewer.ts').then((m) => m.startViewer(canvas.value!)); return; }
  if (params.has('auto')) void start({ mode: 'solo', code: '', server: '', name: 'Tester', character: 0, preset: params.get('preset') ?? 'high', gore: true, photosensitive: false, tips: !params.has('notips') });
});
</script>

<template>
  <canvas ref="canvas" class="game" @click="g.screen === 'play' && game?.regrab()" />
  <Menu v-if="g.screen === 'menu' && !params.has('viewer')" @start="start" />
  <Screens @quit="quit" />
  <template v-if="g.screen === 'play' && !params.has('viewer')">
    <Hud v-if="!g.dying" @chat="(t) => game?.finishChat(t)" />
    <Panels v-if="g.panel" @craft="craft" @fire="game?.placeFire()" @resume="resume" @quit="quit" @tips="setTips" @use="(i) => game?.useSlot(i)" @move="(a, b) => game?.moveSlot(a, b)" @drop="(i) => game?.dropSlot(i)" />
    <Knap v-if="g.knapping" @strike="game?.knapStrike()" @done="(h, k) => game?.finishKnap(h, k)" />
  </template>
</template>
