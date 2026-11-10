import type { LookType } from "../../render/groundPaint";

export const FIELD_TURN_REACH = 3;
const UNSET = -1;

export function fieldTurns(shown: readonly LookType[], side: number): Uint8Array {
  const turns = new Int16Array(shown.length).fill(UNSET);
  const queue = new Int32Array(shown.length);
  for (let tile = 0; tile < shown.length; tile++) if (shown[tile] === "field" && turns[tile] === UNSET) fillField(shown, side, tile, turns, queue);
  spreadPastEdges(turns, side, queue);
  return Uint8Array.from(turns, (turn) => Math.max(turn, 0));
}

function fillField(shown: readonly LookType[], side: number, start: number, turns: Int16Array, queue: Int32Array): void {
  const turn = turnOf(start);
  let head = 0;
  let tail = 0;
  turns[start] = turn;
  queue[tail++] = start;
  while (head < tail) {
    const tile = queue[head++];
    for (const next of neighbours(tile, side)) {
      if (shown[next] !== "field" || turns[next] !== UNSET) continue;
      turns[next] = turn;
      queue[tail++] = next;
    }
  }
}

function spreadPastEdges(turns: Int16Array, side: number, queue: Int32Array): void {
  let tail = 0;
  for (let tile = 0; tile < turns.length; tile++) if (turns[tile] !== UNSET) queue[tail++] = tile;
  let head = 0;
  for (let ring = 0; ring < FIELD_TURN_REACH; ring++) {
    const end = tail;
    for (; head < end; head++) tail = spreadFrom(queue[head], turns, side, queue, tail);
  }
}

function spreadFrom(tile: number, turns: Int16Array, side: number, queue: Int32Array, tail: number): number {
  for (const next of neighbours(tile, side)) {
    if (turns[next] !== UNSET) continue;
    turns[next] = turns[tile];
    queue[tail++] = next;
  }
  return tail;
}

const around = new Int32Array(4);

function neighbours(tile: number, side: number): Int32Array {
  const x = tile % side;
  let count = 0;
  if (x > 0) around[count++] = tile - 1;
  if (x < side - 1) around[count++] = tile + 1;
  if (tile >= side) around[count++] = tile - side;
  if (tile < side * (side - 1)) around[count++] = tile + side;
  return around.subarray(0, count);
}

function turnOf(tile: number): number {
  let h = Math.imul(tile ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % 256;
}
