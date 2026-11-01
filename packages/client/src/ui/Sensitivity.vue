<script setup lang="ts">
import { SENS_MAX, SENS_MIN, useGame } from '../stores/game.ts';
const g = useGame();
const save = () => { try { localStorage.setItem('dh.sens', String(g.sens)); } catch { /* private mode */ } };
// A focused slider would swallow Esc and the other game keys.
const release = (e: Event) => (e.target as HTMLElement).blur();
</script>

<template>
  <label class="sens">
    <span>Mouse sensitivity <b>{{ g.sens }}%</b></span>
    <input v-model.number="g.sens" type="range" :min="SENS_MIN" :max="SENS_MAX" step="5" @input="save" @pointerup="release" />
  </label>
</template>

<style scoped>
.sens { display: grid; gap: 5px; color: var(--dim); font-size: 14px; }
.sens span { display: flex; justify-content: space-between; }
.sens b { font-weight: 400; color: var(--ink); }
.sens input { width: 100%; padding: 0; border: none; background: none; accent-color: #e9e1cf; cursor: pointer; }
</style>
