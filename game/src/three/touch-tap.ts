import type { Vec } from "../sim/vec";
import type { PointerAction } from "./pointer";

export type TouchTapAction =
  | { kind: "pin"; id: string }
  | { kind: "aim"; id: string }
  | { kind: "preview"; at: Vec }
  | { kind: "place"; at: Vec }
  | { kind: "click" };

export interface TouchTapInput {
  pinnedId: string | null;
  previewScreen: Vec | null;
  previewAt: Vec | null;
  tapScreen: Vec;
  hit: PointerAction;
  ground: Vec | null;
  utilityPoint: boolean;
  pickRadius: number;
}

export function touchTapAction(input: TouchTapInput): TouchTapAction {
  if (input.utilityPoint && input.ground) return utilityTap(input, input.ground);
  if (input.hit.kind === "vehicle") return input.hit.id === input.pinnedId ? { kind: "aim", id: input.hit.id } : { kind: "pin", id: input.hit.id };
  return { kind: "click" };
}

function utilityTap(input: TouchTapInput, ground: Vec): TouchTapAction {
  const { previewScreen, previewAt, tapScreen, pickRadius } = input;
  if (previewScreen && previewAt && Math.hypot(previewScreen.x - tapScreen.x, previewScreen.y - tapScreen.y) <= pickRadius) return { kind: "place", at: previewAt };
  return { kind: "preview", at: ground };
}
