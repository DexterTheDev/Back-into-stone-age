/** Chapter 1 map: "The Hollow". About 1.5 x 1.5 km, origin at the map centre, +X east, +Z south, +Y up. */
export const WORLD_SIZE = 1536;
export const HALF_WORLD = WORLD_SIZE / 2;
/** Height samples per side (1 m spacing). */
export const HEIGHT_RES = 1537;
/** Physics height samples per side (2 m spacing). */
export const PHYS_RES = 769;
/** Heights are stored as Uint16 in 1/64 m steps. */
export const HEIGHT_SCALE = 64;
export const CHUNK_SIZE = 256;
export const CHUNKS_PER_SIDE = WORLD_SIZE / CHUNK_SIZE;

/** Terrain material layers, in texture-array order. */
export const LAYERS = ['leaf', 'mud', 'rock', 'gravel', 'sand', 'moss'] as const;
export type LayerName = (typeof LAYERS)[number];

export interface RiverPoint { x: number; z: number; y: number; w: number }

export type NodeKind = 'flint' | 'branch' | 'fiber' | 'tinder' | 'clay' | 'stone' | 'moss' | 'bark' | 'pyrite' | 'copper' | 'bone' | 'reed';
export interface ResourceNode { id: number; kind: NodeKind; x: number; y: number; z: number }
export interface StoryProp { id: string; x: number; y: number; z: number; yaw: number }

export interface WorldMeta {
  version: number;
  mouth: { x: number; y: number; z: number; dirX: number; dirZ: number };
  chambers: { name: string; x: number; y: number; z: number }[];
  spawns: { x: number; y: number; z: number; yaw: number; chamber: string }[];
  river: RiverPoint[];
  tunnelWaterY: number;
  features: Record<string, { x: number; y: number; z: number; yaw?: number; hw?: number; h?: number }>;
  /** Per-map look: ground tints and fog. */
  look?: { tints?: [number, number, number][]; fog?: [number, number, number]; fogDensity?: number; caveTint?: [number, number, number]; floraTint?: [number, number, number] };
  nodes: ResourceNode[];
  props: StoryProp[];
  /** Solid walkways high in the trees: a box per deck. */
  platforms?: { x: number; y: number; z: number; hx: number; hy: number; hz: number; yaw?: number }[];
  /** Still, warm water on the surface. */
  pools?: { x: number; y: number; z: number; r: number }[];
}
