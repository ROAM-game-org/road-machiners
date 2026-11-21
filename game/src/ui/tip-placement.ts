export type Box = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };
export type TipSpot = { left: number; top: number; side: "above" | "below" };

const clamp = (v: number, low: number, high: number): number => Math.min(Math.max(v, low), Math.max(low, high));

export function tipPlacement(part: Box, tip: Size, area: Size, gap: number): TipSpot {
  const below = part.y + part.height + gap;
  const above = part.y - gap - tip.height;
  const fitsBelow = below + tip.height <= area.height;
  const fitsAbove = above >= 0;
  const roomBelow = area.height - (part.y + part.height);
  const roomAbove = part.y;
  const side = fitsBelow || (!fitsAbove && roomBelow >= roomAbove) ? "below" : "above";
  const top = clamp(side === "below" ? below : above, 0, area.height - tip.height);
  const left = clamp(part.x + part.width / 2 - tip.width / 2, 0, area.width - tip.width);
  return { left, top, side };
}
