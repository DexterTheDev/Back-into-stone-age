/** Creature tuning. Distances in metres, speeds in m/s. */
export type SpeciesId = 'trex' | 'raptor' | 'pectinodon' | 'dakotaraptor' | 'widow' | 'pachy' | 'triceratops' | 'ankylosaurus' | 'edmontosaurus' | 'thescelosaurus' | 'croc' | 'pterosaur' | 'didelphodon';

/** Which brain drives it. */
export type Role = 'apex' | 'pack' | 'territorial' | 'obstacle' | 'herd' | 'ambush' | 'aerial' | 'swarm' | 'skittish';

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  role: Role;
  /** Glb and scale relative to the baked asset. `proc` models are built in the client. */
  asset: 'trex' | 'raptor' | 'triceratops' | 'hadrosaur' | 'ankylosaur' | 'pachy' | 'proc_croc' | 'proc_pterosaur' | 'proc_mammal';
  scale: number;
  walk: number; trot: number; run: number;
  turn: number; // radians per second
  /** Metres from centre at which a bite lands. */
  reach: number;
  damage: number;
  /** Seconds between bites. */
  biteTime: number;
  /** Hearing is multiplied by this when hunting. */
  hearingHunt: number;
  sight: number;
  /** Full cone angle, radians. */
  fov: number;
  health: number;
  radius: number;
  /** Fits through the cave passages. */
  caves: boolean;
  /** Clip speed at which the walk and run cycles look planted. */
  walkClipSpeed: number; runClipSpeed: number;
  /** Territorial animals defend this far around home. */
  territory?: number;
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  trex: { id: 'trex', name: 'Old Scar', role: 'apex', asset: 'trex', scale: 1, walk: 2.8, trot: 5.5, run: 8.8, turn: 0.9, reach: 7.2, damage: 999, biteTime: 2.2, hearingHunt: 1.25, sight: 70, fov: 2.4, health: 2000, radius: 2.4, caves: false, walkClipSpeed: 3.2, runClipSpeed: 9 },
  raptor: { id: 'raptor', name: 'Acheroraptor', role: 'pack', asset: 'raptor', scale: 1, walk: 1.9, trot: 4.6, run: 8.4, turn: 3.6, reach: 2.1, damage: 34, biteTime: 1.1, hearingHunt: 1.25, sight: 46, fov: 3.4, health: 120, radius: 0.5, caves: true, walkClipSpeed: 1.8, runClipSpeed: 8 },
  pectinodon: { id: 'pectinodon', name: 'Pectinodon', role: 'pack', asset: 'raptor', scale: 0.46, walk: 1.5, trot: 3.8, run: 6.4, turn: 4.4, reach: 1.1, damage: 16, biteTime: 0.9, hearingHunt: 1.25, sight: 34, fov: 4, health: 40, radius: 0.28, caves: true, walkClipSpeed: 0.9, runClipSpeed: 4 },
  dakotaraptor: { id: 'dakotaraptor', name: 'Dakotaraptor', role: 'pack', asset: 'raptor', scale: 1.7, walk: 2.2, trot: 5.2, run: 8.9, turn: 3, reach: 3.2, damage: 52, biteTime: 1.3, hearingHunt: 1.3, sight: 58, fov: 3.2, health: 340, radius: 0.85, caves: true, walkClipSpeed: 3, runClipSpeed: 13 },
  widow: { id: 'widow', name: 'The Widow', role: 'pack', asset: 'raptor', scale: 1.95, walk: 2.3, trot: 5.4, run: 9.2, turn: 3, reach: 3.6, damage: 70, biteTime: 1.4, hearingHunt: 1.4, sight: 72, fov: 3.6, health: 700, radius: 1, caves: true, walkClipSpeed: 3.4, runClipSpeed: 15 },
  pachy: { id: 'pachy', name: 'Pachycephalosaurus', role: 'territorial', asset: 'pachy', scale: 1, walk: 1.8, trot: 4, run: 7.8, turn: 2.2, reach: 2.2, damage: 40, biteTime: 1.8, hearingHunt: 1, sight: 34, fov: 3, health: 260, radius: 0.8, caves: false, walkClipSpeed: 1.8, runClipSpeed: 7, territory: 40 },
  triceratops: { id: 'triceratops', name: 'Triceratops', role: 'territorial', asset: 'triceratops', scale: 1, walk: 1.7, trot: 3.6, run: 7.4, turn: 1.1, reach: 4.8, damage: 90, biteTime: 2.2, hearingHunt: 1, sight: 36, fov: 2.6, health: 1400, radius: 2, caves: false, walkClipSpeed: 2.2, runClipSpeed: 7.4, territory: 34 },
  ankylosaurus: { id: 'ankylosaurus', name: 'Ankylosaurus', role: 'obstacle', asset: 'ankylosaur', scale: 1, walk: 1.2, trot: 2.2, run: 3.6, turn: 0.9, reach: 5.6, damage: 75, biteTime: 2.6, hearingHunt: 1, sight: 14, fov: 2.4, health: 1600, radius: 1.9, caves: false, walkClipSpeed: 1.6, runClipSpeed: 4 },
  edmontosaurus: { id: 'edmontosaurus', name: 'Edmontosaurus', role: 'herd', asset: 'hadrosaur', scale: 1.5, walk: 2.1, trot: 4.2, run: 8.6, turn: 1.3, reach: 3, damage: 60, biteTime: 1, hearingHunt: 1, sight: 40, fov: 3.4, health: 900, radius: 1.5, caves: false, walkClipSpeed: 2.6, runClipSpeed: 9 },
  thescelosaurus: { id: 'thescelosaurus', name: 'Thescelosaurus', role: 'skittish', asset: 'hadrosaur', scale: 0.42, walk: 1.5, trot: 3.6, run: 7.4, turn: 3.4, reach: 0, damage: 0, biteTime: 1, hearingHunt: 1, sight: 26, fov: 4, health: 40, radius: 0.4, caves: false, walkClipSpeed: 0.9, runClipSpeed: 4 },
  croc: { id: 'croc', name: 'Giant crocodilian', role: 'ambush', asset: 'proc_croc', scale: 1, walk: 1.4, trot: 3.2, run: 7, turn: 1.6, reach: 3.6, damage: 999, biteTime: 2, hearingHunt: 1, sight: 34, fov: 5, health: 1500, radius: 1.2, caves: false, walkClipSpeed: 1, runClipSpeed: 1 },
  pterosaur: { id: 'pterosaur', name: 'Azhdarchid', role: 'aerial', asset: 'proc_pterosaur', scale: 1, walk: 12, trot: 16, run: 22, turn: 1.1, reach: 3.4, damage: 30, biteTime: 3, hearingHunt: 1, sight: 140, fov: 6, health: 300, radius: 1.5, caves: false, walkClipSpeed: 1, runClipSpeed: 1 },
  didelphodon: { id: 'didelphodon', name: 'Didelphodon', role: 'swarm', asset: 'proc_mammal', scale: 1, walk: 1.4, trot: 3.4, run: 6, turn: 5, reach: 0.9, damage: 7, biteTime: 0.8, hearingHunt: 1, sight: 18, fov: 4.5, health: 22, radius: 0.22, caves: true, walkClipSpeed: 1, runClipSpeed: 1 },
};

/** Animation states, shared on the wire. */
export const enum Anim { Idle, Walk, Run, Attack, Jump, Death, Roar, Sniff }
