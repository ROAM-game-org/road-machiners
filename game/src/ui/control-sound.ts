import { CONTROL_STATES, HAND_MS, type ControlCue } from "../data/sounds";

export type PressSound = "key" | "turn" | "screen" | "switch" | "latch" | "latch-lit" | "knob" | "none";

const PRESS_SOUNDS: readonly PressSound[] = ["key", "turn", "screen", "switch", "latch", "latch-lit", "knob", "none"];
const ON_POINTER_DOWN: readonly PressSound[] = ["key", "turn", "screen"];
const CONTROL_ROOTS = "#ui, #report";

let sink: ((cue: ControlCue) => void) | null = null;
let lastKey: { control: HTMLElement; at: number } | null = null;

const PRESS_CUES: Record<Exclude<PressSound, "switch" | "none">, ControlCue> = {
  key: CONTROL_STATES.key.press.cue,
  turn: CONTROL_STATES.turn.press.cue,
  screen: CONTROL_STATES.screen.press.cue,
  latch: CONTROL_STATES.latch.in.cue,
  "latch-lit": CONTROL_STATES.latch.out.cue,
  knob: CONTROL_STATES.knob.step.cue,
};

export function pressCue(sound: PressSound, checked: boolean): ControlCue | null {
  if (sound === "none") return null;
  if (sound === "switch") return (checked ? CONTROL_STATES.switch.off : CONTROL_STATES.switch.on).cue;
  return PRESS_CUES[sound];
}

export function pressSoundOf(value: string, where: string): PressSound {
  const name = value.trim();
  const sound = PRESS_SOUNDS.find((s) => s === name);
  if (!sound) throw new Error(`Button ${where} has no valid --press-sound, got "${value}"`);
  return sound;
}

export function controlStep(cue: ControlCue): void {
  sink?.(cue);
}

function pressedButton(event: Event): HTMLButtonElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const button = target.closest("button");
  return button && button.closest(CONTROL_ROOTS) ? button : null;
}

function soundOf(button: HTMLElement): PressSound {
  return pressSoundOf(getComputedStyle(button).getPropertyValue("--press-sound"), button.className || button.tagName);
}

function playPress(button: HTMLElement, allowed: (sound: PressSound) => boolean): void {
  const sound = soundOf(button);
  if (!allowed(sound)) return;
  const cue = pressCue(sound, button.getAttribute("aria-checked") === "true");
  if (cue) controlStep(cue);
}

function canMove(control: HTMLElement | null): control is HTMLElement {
  return control !== null && control.isConnected && control.checkVisibility();
}

export function keyPress(control: HTMLElement | null): void {
  if (!canMove(control)) return;
  playPress(control, () => true);
  lastKey = { control, at: performance.now() };
}

function echoesKey(button: HTMLElement): boolean {
  return lastKey !== null && lastKey.control === button && performance.now() - lastKey.at <= HAND_MS;
}

export function installControlSounds(doc: Document, play: (cue: ControlCue) => void): void {
  sink = play;
  doc.addEventListener(
    "pointerdown",
    (event) => {
      if (!event.isTrusted || event.button !== 0) return;
      const button = pressedButton(event);
      if (button) playPress(button, (s) => ON_POINTER_DOWN.includes(s));
    },
    true,
  );
  doc.addEventListener(
    "click",
    (event) => {
      if (!event.isTrusted) return;
      const button = pressedButton(event);
      if (!button) return;
      const fromKeyboard = (event as MouseEvent).detail === 0;
      if (fromKeyboard && echoesKey(button)) return;
      playPress(button, (s) => !ON_POINTER_DOWN.includes(s) || fromKeyboard);
    },
    true,
  );
}
