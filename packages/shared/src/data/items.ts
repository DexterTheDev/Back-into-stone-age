/** Everything a player can hold. */
export type ItemId =
  // Gathered.
  | 'flint' | 'branch' | 'fiber' | 'tinder' | 'clay' | 'stone' | 'wood' | 'pole' | 'moss' | 'bark' | 'pyrite' | 'copper_ore' | 'bone' | 'reed'
  // Made.
  | 'blade' | 'hand_axe' | 'spike' | 'spear' | 'stone_pick' | 'bow_drill' | 'striker' | 'torch' | 'rope' | 'wet_pot' | 'pot' | 'water_pot' | 'boiled_water'
  | 'snare' | 'lever' | 'poultice' | 'strong_poultice' | 'mud_paste' | 'smoke_bomb' | 'sling' | 'stake' | 'piton' | 'bored_stone' | 'copper' | 'wire' | 'copper_spike'
  // Food.
  | 'raw_meat' | 'cooked_meat' | 'fish' | 'cooked_fish' | 'river_water'
  // Carried from 1969.
  | 'flashlight' | 'papers' | 'recorder' | 'compass' | 'radio' | 'canteen' | 'camera'
  // Found.
  | 'crystal' | 'old_canteen' | 'spectacles' | 'glasses' | 'journal_page' | 'field_radio' | 'rifle' | 'cartridge' | 'locket' | 'calloway_map' | 'shard' | 'photo';

/** A swing or a shot. `wear` is the share of the tool used up per blow. */
export interface WeaponDef { damage: number; reach: number; cooldown: number; wear: number; noise: number; ammo?: ItemId }
/** Something consumed from the pack. */
export interface UseDef { hunger?: number; thirst?: number; heal?: number; bleeding?: number; fever?: number; heat?: number; sick?: number; leaves?: ItemId; label: string; seconds: number }

export interface ItemDef {
  name: string; stack: number; desc: string;
  tool?: boolean;
  /** Story objects: kept in the pack, never offered for the belt on their own. */
  key?: boolean;
  weapon?: WeaponDef;
  use?: UseDef;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  flint: { name: 'Flint nodule', stack: 8, desc: 'Breaks to a razor edge if you hit it right.' },
  branch: { name: 'Branch', stack: 8, desc: 'Straight enough for a haft.' },
  fiber: { name: 'Plant fibre', stack: 12, desc: 'Stripped nettle stems. It will hold a knot.' },
  tinder: { name: 'Dry tinder', stack: 12, desc: 'Brittle brown scrub. Catches at a spark.' },
  clay: { name: 'River clay', stack: 8, desc: 'Grey and sticky.' },
  stone: { name: 'Hand stone', stack: 4, desc: 'Good for knapping.' },
  wood: { name: 'Firewood', stack: 10, desc: 'Splits and burns slowly.' },
  pole: { name: 'Felled pole', stack: 8, desc: 'Young trunk, cut to length. Heavy on the shoulder.' },
  moss: { name: 'Wet moss', stack: 8, desc: 'Cold and full of water. Hides things, and cuts stay clean under it.' },
  bark: { name: 'Bitter bark', stack: 8, desc: 'It numbs the tongue. Hale would know why.' },
  pyrite: { name: 'Pyrite', stack: 6, desc: 'Fool\'s gold. Throws sparks off flint.' },
  copper_ore: { name: 'Native copper', stack: 8, desc: 'Green-crusted metal, right there in the rock.' },
  bone: { name: 'Clean bone', stack: 8, desc: 'Hard as a tool once it is split.' },
  reed: { name: 'Swamp reeds', stack: 12, desc: 'Hollow, and they bind well.' },

  blade: { name: 'Flint blade', stack: 1, desc: 'Stone edge. It will chip.', tool: true, weapon: { damage: 9, reach: 1.5, cooldown: 0.65, wear: 0.14, noise: 4 } },
  hand_axe: { name: 'Hand axe', stack: 1, desc: 'A blade lashed to a branch. Loud on wood.', tool: true, weapon: { damage: 17, reach: 1.9, cooldown: 1.15, wear: 0.12, noise: 8 } },
  spike: { name: 'Sharpened stick', stack: 1, desc: 'A branch whittled to a point with the pocketknife. Better than empty hands, not by much.', tool: true, weapon: { damage: 13, reach: 2.4, cooldown: 0.95, wear: 0.09, noise: 5 } },
  spear: { name: 'Fire-hardened spear', stack: 1, desc: 'Long, straight and charred to a hard point.', tool: true, weapon: { damage: 34, reach: 2.9, cooldown: 1.05, wear: 0.05, noise: 6 } },
  stone_pick: { name: 'Stone pick', stack: 1, desc: 'Heavy head, short haft. Mining carries 30 metres, further underground.', tool: true },
  bow_drill: { name: 'Bow drill', stack: 1, desc: 'Slow, loud and reliable. The lighter is empty.', tool: true },
  striker: { name: 'Fire striker', stack: 1, desc: 'Flint on pyrite. Quick, and hardly a sound.', tool: true },
  torch: { name: 'Torch', stack: 1, desc: 'Light. It also tells everything where you are.', tool: true },
  rope: { name: 'Fibre rope', stack: 6, desc: 'Twisted three-ply.' },
  wet_pot: { name: 'Unfired pot', stack: 2, desc: 'Soft clay. It has to go in a fire.' },
  pot: { name: 'Clay pot', stack: 1, desc: 'Fired hard. Holds water over a fire.', tool: true },
  water_pot: { name: 'Pot of river water', stack: 1, desc: 'Cloudy. Hale will not let anyone drink it like that.' },
  boiled_water: { name: 'Boiled water', stack: 3, desc: 'Flat, warm and safe.', use: { thirst: 55, label: 'Drink', seconds: 1.5 } },
  snare: { name: 'Snare', stack: 3, desc: 'Noose and bent sapling. Set it and walk away.', tool: true },
  lever: { name: 'Lever pole', stack: 1, desc: 'A long pole and a rope. Moves what one person cannot.', tool: true },
  poultice: { name: 'Poultice', stack: 3, desc: 'Moss and bitter bark. Holds a wound shut and keeps it clean.', use: { heal: 18, bleeding: 60, fever: 35, label: 'Apply', seconds: 3 } },
  strong_poultice: { name: 'Sulphur poultice', stack: 3, desc: 'Hot spring mud, moss and bark. It stings like a burn.', use: { heal: 34, bleeding: 100, fever: 80, label: 'Apply', seconds: 3 } },
  mud_paste: { name: 'Mud paste', stack: 3, desc: 'Smear it on and you stop smelling like food.', use: { label: 'Smear on', seconds: 2 } },
  smoke_bomb: { name: 'Smoke bundle', stack: 3, desc: 'Green fronds packed around an ember. Throw it down and leave.', use: { label: 'Light and drop', seconds: 0.5 } },
  sling: { name: 'Sling', stack: 1, desc: 'Plaited fibre and a pouch. A stone at speed, from out of reach.', tool: true, weapon: { damage: 16, reach: 18, cooldown: 1.5, wear: 0.04, noise: 3, ammo: 'stone' } },
  stake: { name: 'Sharpened stake', stack: 12, desc: 'Driven into the ground, point out.' },
  piton: { name: 'Bone piton', stack: 8, desc: 'Hammered into ash crust, it takes a rope.' },
  bored_stone: { name: 'Bored stone', stack: 1, desc: 'A hole drilled through basalt. Copper pulled through comes out thin.', tool: true },
  copper: { name: 'Copper ingot', stack: 8, desc: 'Soft, heavy and bright where it is scratched.' },
  wire: { name: 'Copper wire', stack: 8, desc: 'Thin enough to wind, thick enough to carry a strike.' },
  copper_spike: { name: 'Copper spike', stack: 1, desc: 'Hammered from an ingot, for the ground line.', tool: true },

  raw_meat: { name: 'Raw meat', stack: 4, desc: 'Fresh, and it smells that way to everything nearby.', use: { hunger: 18, sick: 45, label: 'Eat raw', seconds: 2 } },
  cooked_meat: { name: 'Cooked meat', stack: 4, desc: 'Charred outside. Nobody asks what it was.', use: { hunger: 55, label: 'Eat', seconds: 2 } },
  fish: { name: 'Raw fish', stack: 4, desc: 'Armoured scales and too many teeth.', use: { hunger: 14, sick: 25, label: 'Eat raw', seconds: 2 } },
  cooked_fish: { name: 'Cooked fish', stack: 4, desc: 'Bony and good.', use: { hunger: 42, label: 'Eat', seconds: 2 } },
  river_water: { name: 'River water', stack: 1, desc: 'Cloudy.' },

  flashlight: { name: 'Flashlight', stack: 1, desc: 'Batteries are weak. There are no others.', tool: true },
  papers: { name: 'Expedition papers', stack: 1, desc: "Varga's folder.", key: true },
  recorder: { name: 'Cassette recorder', stack: 1, desc: 'Field notes, one tape. Hold it and click to record what is in front of you.', tool: true },
  compass: { name: 'Compass', stack: 1, desc: 'The needle will not hold north.', tool: true },
  radio: { name: 'Transistor radio', stack: 1, desc: 'Static on every band.', tool: true },
  canteen: { name: 'Canteen', stack: 1, desc: 'Empty.', tool: true },
  camera: { name: 'Polaroid camera', stack: 1, desc: 'Fifteen shots. Hold it and click.', tool: true },

  crystal: { name: 'Dark crystal', stack: 1, desc: 'Heavy for its size. It hums when you touch it.', key: true },
  old_canteen: { name: 'Rusted canteen', stack: 1, desc: 'Army pattern, stamped 1936.', key: true },
  spectacles: { name: 'Round spectacles', stack: 1, desc: 'Wire frames, one lens gone.', key: true },
  glasses: { name: 'Horn-rimmed glasses', stack: 1, desc: "June's. Cracked across the left lens.", key: true },
  journal_page: { name: 'Journal page', stack: 8, desc: 'Water-stained, torn from a bound notebook.', key: true },
  field_radio: { name: '1938 field radio', stack: 1, desc: 'Valves, wax paper and a dead battery bay.', key: true },
  rifle: { name: 'Bolt-action rifle', stack: 1, desc: 'Springfield, oiled by someone who cared. Heard at 300 metres.', tool: true, weapon: { damage: 240, reach: 60, cooldown: 2.4, wear: 0.02, noise: 300, ammo: 'cartridge' } },
  cartridge: { name: '.30-06 cartridge', stack: 6, desc: 'Dated 1938. Every one is a decision.' },
  locket: { name: 'Silver locket', stack: 1, desc: 'A photograph of a girl, and on the back, "W. to A.C. 1937".', key: true },
  calloway_map: { name: "Calloway's map", stack: 1, desc: 'Years of work on the back of a survey sheet.', key: true },
  shard: { name: 'Heartstone shard', stack: 4, desc: 'They warm up near each other.', key: true },
  photo: { name: 'Polaroid', stack: 15, desc: 'Proof no one will ever believe.', key: true },
};

export interface Recipe {
  id: ItemId;
  needs: Partial<Record<ItemId, number>>;
  /** Items used but kept: `blade: 0` in `needs` says the same for tools already in the pack. */
  /** Real-time seconds, during which the player is locked in the work. */
  seconds: number;
  /** Metres the work can be heard at. */
  noise: number;
  /** Where it has to be made. `knap` is the mini-game, `fire` needs a burning fire, `furnace` the clay furnace. */
  station?: 'knap' | 'fire' | 'furnace';
  label: string;
  /** Shown from this mission on. */
  after?: number;
  /** Shown once this clue is in the journal. */
  clue?: string;
  /** How many come out. */
  makes?: number;
  /** Handed back when done, such as the pot after boiling. */
  returns?: ItemId;
}

export const RECIPES: Recipe[] = [
  { id: 'spike', needs: { branch: 1 }, seconds: 3.5, noise: 0, label: 'Sharpen a stick' },
  { id: 'blade', needs: { flint: 1 }, seconds: 0, noise: 25, station: 'knap', label: 'Knap a blade' },
  { id: 'hand_axe', needs: { blade: 1, branch: 1, fiber: 2 }, seconds: 7, noise: 3, label: 'Lash a hand axe' },
  { id: 'rope', needs: { fiber: 3 }, seconds: 4, noise: 0, label: 'Twist rope' },
  { id: 'bow_drill', needs: { branch: 2, rope: 1, blade: 0 }, seconds: 8, noise: 3, label: 'Make a bow drill' },
  { id: 'torch', needs: { branch: 1, fiber: 1, tinder: 1 }, seconds: 3, noise: 0, label: 'Bind a torch' },
  // Chapter 1, after the first night.
  { id: 'wet_pot', needs: { clay: 3 }, seconds: 6, noise: 0, label: 'Shape a clay pot', after: 10 },
  { id: 'pot', needs: { wet_pot: 1, wood: 1 }, seconds: 16, noise: 0, station: 'fire', label: 'Fire the pot', after: 10 },
  { id: 'boiled_water', needs: { water_pot: 1 }, seconds: 10, noise: 0, station: 'fire', label: 'Boil the water', after: 10, returns: 'pot' },
  { id: 'cooked_meat', needs: { raw_meat: 1 }, seconds: 8, noise: 0, station: 'fire', label: 'Cook meat', after: 11 },
  { id: 'cooked_fish', needs: { fish: 1 }, seconds: 6, noise: 0, station: 'fire', label: 'Cook fish', after: 11 },
  { id: 'snare', needs: { rope: 1, branch: 1 }, seconds: 5, noise: 0, label: 'Tie a snare', after: 11 },
  { id: 'stone_pick', needs: { blade: 1, branch: 1, rope: 1 }, seconds: 8, noise: 3, label: 'Make a stone pick', after: 13 },
  { id: 'lever', needs: { pole: 1, rope: 1 }, seconds: 6, noise: 0, label: 'Rig a lever pole', after: 14 },
  { id: 'striker', needs: { flint: 1, pyrite: 1 }, seconds: 4, noise: 2, label: 'Make a fire striker', clue: 'pyrite' },
  { id: 'poultice', needs: { moss: 1, bark: 1 }, seconds: 5, noise: 0, label: 'Mix a poultice', clue: 'bark' },
  // Chapter 2.
  { id: 'stake', needs: { pole: 1 }, seconds: 5, noise: 8, label: 'Cut sharpened stakes', after: 22, makes: 3 },
  { id: 'spear', needs: { spike: 1, wood: 1 }, seconds: 10, noise: 0, station: 'fire', label: 'Harden a spear', clue: 'calloway_weapons' },
  { id: 'sling', needs: { rope: 2, fiber: 2 }, seconds: 7, noise: 0, label: 'Plait a sling', clue: 'calloway_weapons' },
  { id: 'smoke_bomb', needs: { moss: 2, tinder: 1 }, seconds: 4, noise: 0, label: 'Pack a smoke bundle', clue: 'calloway_weapons' },
  { id: 'mud_paste', needs: { clay: 1, moss: 1 }, seconds: 3, noise: 0, label: 'Work up mud paste', clue: 'calloway_weapons' },
  // Chapter 3.
  { id: 'piton', needs: { bone: 1 }, seconds: 4, noise: 12, label: 'Split bone pitons', after: 32, makes: 2 },
  { id: 'bored_stone', needs: { stone: 1 }, seconds: 14, noise: 25, label: 'Drill a bored stone', after: 39 },
  { id: 'copper', needs: { copper_ore: 2, wood: 1 }, seconds: 18, noise: 6, station: 'furnace', label: 'Smelt copper', after: 39 },
  { id: 'wire', needs: { copper: 1, bored_stone: 0 }, seconds: 12, noise: 30, label: 'Draw wire', after: 40, makes: 2 },
  { id: 'copper_spike', needs: { copper: 2 }, seconds: 10, noise: 30, label: 'Hammer a copper spike', after: 44 },
  { id: 'strong_poultice', needs: { moss: 1, bark: 1, clay: 1 }, seconds: 5, noise: 0, label: 'Mix a sulphur poultice', clue: 'hot_remedy' },
];

export const INVENTORY_SLOTS = 30;
/** Bottom-left item bar. */
export const BELT_SLOTS = 6;

export const recipeVisible = (r: Recipe, mission: number, journal: { has(id: string): boolean } | string[]) =>
  (r.after === undefined || mission >= r.after) && (!r.clue || (Array.isArray(journal) ? journal.includes(r.clue) : journal.has(r.clue)));
