/**
 * Day and night cycle: one full day lasts 20 real minutes, 14 of daylight and 6 from dusk to
 * sunrise. The first night is something to live through, not something to wait out.
 */
export const DAYLIGHT_SECONDS = 840;
export const NIGHT_SECONDS = 360;
export const TICK_RATE = 30;
export const SNAPSHOT_RATE = 20;
export const TICK_DT = 1 / TICK_RATE;
/** Player input runs faster than the world, for low latency and smooth motion. */
export const INPUT_RATE = 60;
export const INPUT_DT = 1 / INPUT_RATE;

export const PHASE = { dawnEnd: 0.05, dayEnd: 0.55, duskEnd: 0.625 } as const;
export type DayPhaseName = 'dawn' | 'day' | 'dusk' | 'night';

export function phaseName(t: number): DayPhaseName {
  if (t < PHASE.dawnEnd) return 'dawn';
  if (t < PHASE.dayEnd) return 'day';
  if (t < PHASE.duskEnd) return 'dusk';
  return 'night';
}

/** The game opens late morning, about eight minutes before dusk at full pace. */
export const START_TIME = 0.22;

/** Where the sky has visibly started to die, so "survive until morning" reads as true. */
export const NIGHTFALL = 0.59;
/** The first fire brings the dark on: lit to NIGHTFALL in this many seconds, whatever the hour. */
export const SUNSET_SECONDS = 40;
/** A player short of the fire mission by mid afternoon gets a slower sun, so the shorter day never traps a first-timer. */
export const GRACE_FROM = 0.4;
export const GRACE_PACE = 0.25;

/** How many times faster the clock runs while everyone sleeps. */
export const SLEEP_RATE = 40;

/** How much of the day passes per real second at this point in the cycle. */
export function clockRate(t: number) {
  return t < PHASE.dayEnd ? PHASE.dayEnd / DAYLIGHT_SECONDS : (1 - PHASE.dayEnd) / NIGHT_SECONDS;
}
