<script setup lang="ts">
import { reactive, ref, shallowRef } from 'vue';
import Help from './Help.vue';
import Sensitivity from './Sensitivity.vue';
import { computed } from 'vue';
import { MISSIONS, type SaveData } from '@dino/shared';
const emit = defineEmits<{ start: [o: { mode: 'solo' | 'host' | 'join'; code: string; server: string; name: string; character: number; preset: string; gore: boolean; photosensitive: boolean; tips: boolean; save?: SaveData }] }>();
const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const adult = ref(read('dh.adult', '') === '1');
const birth = ref('');
const refused = ref(false);
const CHARS = [
  { name: 'Dr. Elena Varga', role: 'Geophysicist. Finds ore, reads rock.' },
  { name: 'June Okafor', role: 'Engineer. Builds and crafts faster.' },
  { name: 'Marcus Hale', role: 'Army medic. Treats wounds.' },
  { name: 'Tomás Reyes', role: 'Guide. Reads tracks, moves quietly.' },
];
const f = reactive({ name: read('dh.name', 'Survivor'), character: Number(read('dh.char', '0')), code: '', server: read('dh.server', `ws://${location.hostname}:8787`), preset: read('dh.preset', 'medium'), gore: read('dh.gore', '1') === '1', photosensitive: read('dh.photo', '0') === '1', tips: read('dh.tips', '1') === '1' });
const help = ref<'' | 'play' | 'controls'>('');
// Plain data, not reactive: it is posted to the simulation worker as it stands.
const save = shallowRef<SaveData | null>((() => { try { return JSON.parse(read('dh.save', 'null')) as SaveData | null; } catch { return null; } })());
const saveLabel = computed(() => { const m = save.value && MISSIONS[save.value.mission]; return m ? `Chapter ${m.chapter}: ${m.objective}` : ''; });
const forget = () => { try { localStorage.removeItem('dh.save'); } catch { /* private mode */ } save.value = null; };
function confirmAge() {
  const d = new Date(birth.value);
  if (Number.isNaN(d.getTime())) return;
  const years = (Date.now() - d.getTime()) / (365.25 * 864e5);
  if (years >= 18) { adult.value = true; write('dh.adult', '1'); } else refused.value = true;
}
function go(mode: 'solo' | 'host' | 'join', resume = false) {
  write('dh.name', f.name); write('dh.char', String(f.character)); write('dh.preset', f.preset); write('dh.gore', f.gore ? '1' : '0'); write('dh.photo', f.photosensitive ? '1' : '0'); write('dh.server', f.server); write('dh.tips', f.tips ? '1' : '0');
  const s = resume && save.value ? save.value : undefined;
  emit('start', { mode, code: f.code.trim().toUpperCase(), server: f.server, name: f.name, character: s?.players[0]?.character ?? f.character, preset: f.preset, gore: f.gore, photosensitive: f.photosensitive, tips: f.tips, save: s });
}
</script>

<template>
  <div class="menu">
    <div class="wrap">
      <h1>DINO HORROR</h1>
      <p class="sub">Montana, July 1969. Sixty-six million years ago.</p>

      <div v-if="!adult" class="gate">
        <p><b>Adults only.</b> Graphic violence, gore and brutal death scenes. Blood and dismemberment can be reduced in settings. Photosensitive option available.</p>
        <p v-if="refused" class="no">This game is for players aged 18 and over.</p>
        <label>Date of birth <input type="date" v-model="birth" /></label>
        <button :disabled="!birth || refused" @click="confirmAge">Continue</button>
      </div>

      <div v-else class="setup">
        <div class="col">
          <label>Name <input v-model="f.name" maxlength="24" /></label>
          <div class="chars">
            <button v-for="(c, i) in CHARS" :key="c.name" :class="{ on: f.character === i }" @click="f.character = i"><b>{{ c.name }}</b><span>{{ c.role }}</span></button>
          </div>
        </div>
        <div class="col">
          <button v-if="save" class="big cont" @click="go('solo', true)">Continue<small>{{ saveLabel }}</small></button>
          <button class="big" @click="save && forget(); go('solo')">{{ save ? 'New game' : 'Play alone' }}</button>
          <div class="row even"><button @click="help = 'play'">How to play</button><button @click="help = 'controls'">Controls</button></div>
          <button v-if="save" class="hostcont" @click="go('host', true)">Continue as co-op host</button>
          <button @click="save && forget(); go('host')">Host co-op</button>
          <div class="row"><input v-model="f.code" placeholder="Invite code" maxlength="5" /><button :disabled="f.code.length < 5" @click="go('join')">Join</button></div>
          <label>Server <input v-model="f.server" /></label>
          <label>Graphics
            <select v-model="f.preset"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="ultra">Ultra</option></select>
          </label>
          <Sensitivity />
          <label class="check"><input type="checkbox" v-model="f.tips" /> Show tips and markers</label>
          <label class="check"><input type="checkbox" v-model="f.gore" /> Full blood and gore</label>
          <label class="check"><input type="checkbox" v-model="f.photosensitive" /> Soften flashes</label>
        </div>
      </div>
    </div>
    <div v-if="help" class="helpwrap" @click.self="help = ''"><Help :tab="help" @close="help = ''" /></div>
  </div>
</template>

<style scoped>
.menu { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; padding: 24px; background: radial-gradient(ellipse at 50% 120%, #2a2112 0%, #0c0b08 55%, #000 100%); }
.wrap { width: min(860px, 100%); }
h1 { font-size: clamp(44px, 9vw, 92px); letter-spacing: 0.14em; margin: 0; color: #e9e1cf; font-weight: 400; }
.sub { color: var(--dim); margin: 6px 0 34px; }
.gate { max-width: 520px; display: grid; gap: 14px; }
.gate label { display: grid; gap: 6px; color: var(--dim); }
.no { color: #d0543f; }
.setup { display: grid; grid-template-columns: 1.35fr 1fr; gap: 28px; }
.col { display: grid; gap: 12px; align-content: start; }
label { display: grid; gap: 5px; color: var(--dim); font-size: 14px; }
label.check { display: flex; align-items: center; gap: 9px; }
.chars { display: grid; gap: 8px; }
.chars button { text-align: left; display: grid; gap: 3px; }
.chars button span { color: var(--dim); font-size: 13px; }
.chars button.on { border-color: #e9e1cf; background: rgba(233, 225, 207, 0.08); }
.big { font-size: 20px; padding: 16px; border-color: rgba(233, 225, 207, 0.5); }
.cont { display: grid; gap: 4px; }
.cont small { font-size: 13px; color: var(--dim); }
.row { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
.row.even { grid-template-columns: 1fr 1fr; }
.helpwrap { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(0,0,0,.6); }
@media (max-width: 720px) { .setup { grid-template-columns: 1fr; } }
</style>
