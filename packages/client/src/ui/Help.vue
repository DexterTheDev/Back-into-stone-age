<script setup lang="ts">
import { ref } from 'vue';
const props = defineProps<{ tab?: 'play' | 'controls' }>();
const emit = defineEmits<{ close: [] }>();
const tab = ref<'play' | 'controls'>(props.tab ?? 'play');

const GROUPS: { title: string; keys: [string, string][] }[] = [
  { title: 'Moving', keys: [['W A S D', 'Walk'], ['Mouse', 'Look around. Sensitivity is on the menu and pause screens'], ['Shift', 'Run (hold). Loud'], ['C', 'Crouch (hold). Silent'], ['Space', 'Jump']] },
  { title: 'Doing things', keys: [['E', 'Use whatever the prompt shows: take, inspect, feed fire, drink, chop'], ['F', 'Flashlight on or off'], ['Tab', 'Pack and crafting'], ['J', 'Field journal'], ['H', 'Show where to go'], ['1 to 6', 'Hold what is on the item bar. Drag items onto it in the pack'], ['Left click', 'Strike with what you hold, or use it']] },
  { title: 'With friends', keys: [['T', 'Text chat. Makes no noise'], ['Q', 'Ping: here'], ['Z', 'Ping: danger'], ['X', 'Ping: need help'], ['V', 'Ping: hide']] },
  { title: 'Game', keys: [['Esc', 'Pause'], ['F3', 'Frame rate and stats']] },
];
const NOISE: [string, string][] = [['Crouching', 'Silent'], ['Walking', '3 m'], ['Running', '10 m'], ['Running on gravel', '20 m'], ['Snapping a branch', '15 m'], ['Knapping stone', '25 m'], ['Chopping a tree', '40 m']];
</script>

<template>
  <div class="help">
    <header>
      <button :class="{ on: tab === 'play' }" @click="tab = 'play'">How to play</button>
      <button :class="{ on: tab === 'controls' }" @click="tab = 'controls'">Controls</button>
      <button class="close" @click="emit('close')">Back</button>
    </header>

    <div v-if="tab === 'play'" class="body">
      <section>
        <h3>You are prey</h3>
        <p>You survive by staying quiet, staying hidden and planning ahead. A sharpened stick will make a raptor flinch and buy you a second. It will not win a fight, and nothing will stop Old Scar.</p>
      </section>
      <section>
        <h3>Know what to do next</h3>
        <p>Your objective stays at the top left, with the next step under it. Glowing spots mark what that step needs. Press <kbd>H</kbd> any time to see which way to go.</p>
      </section>
      <section>
        <h3>Gather and make</h3>
        <p>Walk up to something and press <kbd>E</kbd> when a prompt appears. Open your pack with <kbd>Tab</kbd> to make things. The next useful item is highlighted. Work takes time, and moving cancels it.</p>
        <p>In the pack you can drag anything onto the item bar at the bottom left, in whatever order you like. Keys <kbd>1</kbd> to <kbd>6</kbd> follow that order.</p>
      </section>
      <section>
        <h3>Fire is everything</h3>
        <p>Night comes after about 10 minutes, and the sun drops fast once your first fire catches. Dusk to sunrise takes about 6 minutes, so keep spare wood. Fire keeps you warm and holds raptors at the edge of the light, but its glow also draws them in. Feed it with <kbd>E</kbd>. If it dies, they come.</p>
      </section>
      <section>
        <h3>Sound gets you killed</h3>
        <p>Animals hear loud noises, not careful footsteps. One sound makes them look. Repeated sounds bring them over. The ring around your sight shows how far your last sound carried.</p>
        <table><tr v-for="[a, b] in NOISE" :key="a"><td>{{ a }}</td><td>{{ b }}</td></tr></table>
      </section>
      <section>
        <h3>Stay alive</h3>
        <p>Watch the bars at the bottom left. Thirst and cold will kill you as surely as teeth. Drink at the river with <kbd>E</kbd>, and warm yourself at a fire. Your flashlight batteries never come back, and light can be seen from far away.</p>
      </section>
      <section>
        <h3>With friends</h3>
        <p>Choose Host co-op and share the invite code shown at the top right. Split up to work faster, and get each other up with <kbd>E</kbd> when someone goes down. Bigger groups face bigger packs.</p>
      </section>
    </div>

    <div v-else class="body keys">
      <section v-for="g in GROUPS" :key="g.title">
        <h3>{{ g.title }}</h3>
        <dl><template v-for="[k, what] in g.keys" :key="k"><dt><kbd>{{ k }}</kbd></dt><dd>{{ what }}</dd></template></dl>
      </section>
    </div>
  </div>
</template>

<style scoped>
.help { width: min(820px, 100%); max-height: 88vh; display: flex; flex-direction: column; background: rgba(12, 11, 9, 0.985); border: 1px solid var(--line); text-align: left; }
header { display: flex; gap: 6px; padding: 14px 18px 0; border-bottom: 1px solid var(--line); }
header button { border-bottom: none; }
header button.on { background: rgba(233, 225, 207, 0.1); border-color: rgba(233, 225, 207, 0.4); }
.close { margin-left: auto; margin-bottom: 8px; }
.body { overflow: auto; padding: 8px 26px 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 30px; }
h3 { font-weight: 700; font-size: 16px; margin: 14px 0 5px; }
p { margin: 0; color: #c9c0ad; line-height: 1.5; font-size: 14px; }
table { border-collapse: collapse; margin-top: 8px; width: 100%; font-size: 13px; color: #c9c0ad; }
td { padding: 2px 0; border-bottom: 1px solid var(--line); }
td:last-child { text-align: right; }
kbd { border: 1px solid rgba(233, 225, 207, .55); padding: 1px 6px; font: inherit; font-size: 12px; white-space: nowrap; color: var(--ink); }
dl { display: grid; grid-template-columns: auto 1fr; gap: 7px 12px; margin: 6px 0 0; font-size: 14px; }
dd { margin: 0; color: #c9c0ad; align-self: center; }
@media (max-width: 680px) { .body { grid-template-columns: 1fr; } }
</style>
