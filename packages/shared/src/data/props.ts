/** Story objects placed in the baked worlds. `model` is a scan, `shape` is built in the client from primitives. */
import type { ItemId } from './items.ts';

export type PropShape = 'arrow' | 'page' | 'marker' | 'tent' | 'table' | 'rack' | 'moss' | 'scratch' | 'tally' | 'carcass' | 'pass' | 'stone_upright' | 'coil' | 'scorch' | 'bundle' | 'newspaper' | 'shard' | 'cache' | 'jacket';

export interface PropDef {
  label: string;
  model?: string; scale?: number; rx?: number; y?: number;
  shape?: PropShape;
  /** Not in the world until the story reveals it. */
  hidden?: boolean;
  clue?: string;
  pick?: ItemId;
  /** Stays in the world after use: reading something does not remove it. */
  stays?: boolean;
  reach?: number;
}

const page = (n: number): PropDef => ({ label: 'Pick up the page', shape: 'page', hidden: true, clue: `page_${n}`, pick: 'journal_page' });
const cache = (n: number): PropDef => ({ label: 'Open the cache', shape: 'cache', hidden: true, clue: `cache_${n}` });
const arrow: PropDef = { label: '', shape: 'arrow', hidden: true };
const marker: PropDef = { label: 'Read the marker', shape: 'marker', clue: 'graves', stays: true };

export const PROPS: Record<string, PropDef> = {
  // The Hollow.
  flashlight: { label: 'Pick up flashlight', model: 'small_plastic_torch', scale: 1.15, y: 0.035 },
  array_case: { label: 'Inspect', model: 'vintage_spacecraft_instrument', scale: 3.4, rx: 0.3, stays: true },
  array_compressor: { label: 'Inspect', model: 'old_military_compressor', scale: 1.5, rx: 0.5, stays: true },
  papers: { label: "Open Varga's bag", model: 'vintage_suitcase', scale: 0.8 },
  recorder: { label: 'Play the cassette', model: 'portable_cassette_player', scale: 1.1 },
  compass: { label: 'Take compass', model: 'seadogs_compass', scale: 1.2 },
  radio: { label: 'Take radio', model: 'vintage_radio_transceiver', scale: 0.8 },
  dragmarks: { label: 'Inspect marks', stays: true },
  crate: { label: 'Open the crate', model: 'old_military_crate', scale: 1, stays: true },
  footprint: { label: 'Inspect print', stays: true },
  old_canteen: { label: 'Take the canteen', model: 'can_rusted', scale: 1.4, clue: 'old_canteen', pick: 'old_canteen' },
  spectacles: { label: 'Take the spectacles', shape: 'bundle', clue: 'spectacles', pick: 'spectacles' },
  moss_curtain: { label: 'Pull the moss aside', shape: 'moss', reach: 3.5 },
  scratched: { label: 'Read the wall', shape: 'scratch', clue: 'scratched', stays: true, reach: 3.5, hidden: true },
  crystal: { label: 'Touch the crystal', shape: 'shard', clue: 'crystal', pick: 'crystal' },
  glasses: { label: 'Pick them up', shape: 'bundle', hidden: true, clue: 'glasses', pick: 'glasses' },
  kill: { label: 'Cut meat from it', shape: 'carcass', hidden: true, stays: true, reach: 5 },
  arrows: { label: 'Look at the rock', shape: 'arrow', hidden: true, clue: 'marks', stays: true, reach: 5 },
  arrow_1: arrow, arrow_2: arrow, arrow_3: arrow, arrow_4: arrow, arrow_5: arrow,
  // The Drowned Valley.
  arrow_v1: arrow, arrow_v2: arrow, arrow_v3: arrow, arrow_v4: arrow, arrow_v5: arrow, arrow_v6: arrow, arrow_v7: arrow, arrow_v8: arrow,
  tent_1: { label: '', shape: 'tent' }, tent_2: { label: '', shape: 'tent' }, tent_3: { label: '', shape: 'tent' },
  roster: { label: 'Read the roster', shape: 'table', clue: 'roster', stays: true },
  rifle_rack: { label: 'Check the rifles', shape: 'rack', clue: 'rifles', stays: true },
  field_radio: { label: 'Take the radio', model: 'vintage_radio_transceiver', scale: 1, clue: 'field_radio', pick: 'field_radio' },
  grave_1: marker, grave_2: marker, grave_3: marker, grave_4: { ...marker },
  page_1: page(1), page_2: page(2), page_3: page(3), page_4: page(4), page_5: page(5), page_6: page(6), page_7: page(7), page_8: page(8),
  shard_swamp: { label: 'Take the shard', shape: 'shard', hidden: true, clue: 'shard_1', pick: 'shard' },
  shard_plain: { label: 'Take the shard', shape: 'shard', hidden: true, clue: 'shard_2', pick: 'shard' },
  shard_den: { label: 'Take the shard', shape: 'shard', hidden: true, clue: 'shard_3', pick: 'shard' },
  shard_flats: { label: 'Take the shard', shape: 'shard', hidden: true, clue: 'shard_4', pick: 'shard' },
  tally: { label: 'Look at the tallies', shape: 'tally', clue: 'tally', stays: true },
  traps: { label: 'Check the snares', shape: 'bundle', clue: 'traps', stays: true },
  calloway_map: { label: 'Take the map', shape: 'page', clue: 'calloway_map', pick: 'calloway_map' },
  green_lights: { label: 'Look through the drawings', shape: 'page', clue: 'green_lights', stays: true },
  knife_page: { label: 'Read the page', shape: 'page', clue: 'knife_page', stays: true },
  swamp_cry: { label: 'Help them', hidden: true, shape: 'jacket', stays: true },
  dug_grave: { label: 'Fill in the grave', hidden: true, shape: 'marker', stays: true },
  cache_1: cache(1), cache_2: cache(2), cache_3: cache(3), cache_4: cache(4), cache_5: cache(5), cache_6: cache(6),
  cache_7: cache(7), cache_8: cache(8), cache_9: cache(9), cache_10: cache(10), cache_11: cache(11), cache_12: cache(12),
  // The Second Sun.
  ring_stones: { label: 'Examine the ring', shape: 'stone_upright', clue: 'ring', stays: true, reach: 7 },
  coil: { label: 'Examine the coil', shape: 'coil', clue: 'coil', stays: true },
  scorch: { label: 'Examine the rock', shape: 'scorch', clue: 'scorch', stays: true, reach: 6 },
  wnotes: { label: "Read Whitcombe's notes", shape: 'page', clue: 'wnotes', stays: true },
  last_cache: { label: 'Open the cache', shape: 'cache', clue: 'last_note' },
  fate: { label: 'Look closer', shape: 'jacket', clue: 'fate', stays: true },
  // 1969.
  newspaper: { label: 'Read the newspaper', shape: 'newspaper', hidden: true, stays: true },
};
