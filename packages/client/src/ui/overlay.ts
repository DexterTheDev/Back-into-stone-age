/** Elements the engine moves every frame. Kept outside Vue so the game loop never touches reactivity. */
export const overlay = { marker: null as HTMLElement | null, markerLabel: null as HTMLElement | null };
