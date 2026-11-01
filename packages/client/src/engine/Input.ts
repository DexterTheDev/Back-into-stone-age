/** Keyboard and pointer-lock mouse. */
import { Btn } from '@dino/shared/sim/movement.ts';

/** Radians per mouse count at 100%. Raw input has no OS acceleration, so it needs more than a desktop pointer. */
const LOOK_SPEED = 0.0038;

const BIND: Record<string, number> = { KeyW: Btn.Forward, KeyS: Btn.Back, KeyA: Btn.Left, KeyD: Btn.Right, ShiftLeft: Btn.Sprint, ShiftRight: Btn.Sprint, KeyC: Btn.Crouch, Space: Btn.Jump };

export class Input {
  buttons = 0;
  yaw = 0;
  pitch = 0;
  /** Player's setting, where 1 is the default. */
  sensitivity = () => 1;
  onKey: (code: string) => void = () => {};
  /** Left mouse button, while the game has the mouse. */
  onClick: () => void = () => {};
  /** Fires when the browser takes the mouse back, for example on Esc. */
  onLockLost: () => void = () => {};
  enabled = false;
  crouchToggle = false;

  constructor(private canvas: HTMLCanvasElement) {
    addEventListener('keydown', this.keydown);
    addEventListener('keyup', this.keyup);
    addEventListener('mousemove', this.move);
    addEventListener('mousedown', this.down);
    addEventListener('blur', () => { this.buttons = 0; });
    document.addEventListener('pointerlockchange', this.lockChange);
  }
  private wasLocked = false;
  private lockChange = () => {
    const now = this.locked;
    if (this.wasLocked && !now) { this.buttons = 0; this.onLockLost(); }
    this.wasLocked = now;
  };
  dispose() { document.removeEventListener('pointerlockchange', this.lockChange); removeEventListener('keydown', this.keydown); removeEventListener('keyup', this.keyup); removeEventListener('mousemove', this.move); removeEventListener('mousedown', this.down); }
  /** Raw mouse where the browser allows it: no OS acceleration, no smoothing. */
  lock() {
    const c = this.canvas as HTMLCanvasElement & { requestPointerLock(o?: { unadjustedMovement?: boolean }): Promise<void> | void };
    const r = c.requestPointerLock?.({ unadjustedMovement: true });
    if (r instanceof Promise) r.catch(() => { c.requestPointerLock?.(); });
  }
  unlock() { document.exitPointerLock?.(); }
  get locked() { return document.pointerLockElement === this.canvas; }

  private keydown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.repeat) return;
    if (BIND[e.code]) this.buttons |= BIND[e.code];
    if (e.code === 'Tab') e.preventDefault();
    this.onKey(e.code);
  };
  private keyup = (e: KeyboardEvent) => { if (BIND[e.code]) this.buttons &= ~BIND[e.code]; };
  private down = (e: MouseEvent) => { if (e.button === 0 && this.locked && this.enabled) this.onClick(); };
  private move = (e: MouseEvent) => {
    if (!this.locked || !this.enabled) return;
    const k = LOOK_SPEED * this.sensitivity();
    this.yaw -= e.movementX * k;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - e.movementY * k));
  };
}
