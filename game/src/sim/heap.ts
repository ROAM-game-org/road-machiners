export type Heap = { items: Int32Array; count: number; key: Float64Array };

export function newHeap(capacity: number, key: Float64Array): Heap {
  return { items: new Int32Array(capacity), count: 0, key };
}

function below(h: Heap, a: number, b: number): boolean {
  const ka = h.key[h.items[a]];
  const kb = h.key[h.items[b]];
  return ka < kb || (ka === kb && h.items[a] < h.items[b]);
}

function swap(h: Heap, a: number, b: number): void {
  const t = h.items[a];
  h.items[a] = h.items[b];
  h.items[b] = t;
}

export function pushHeap(h: Heap, k: number): void {
  let at = h.count++;
  h.items[at] = k;
  while (at > 0) {
    const parent = (at - 1) >> 1;
    if (!below(h, at, parent)) return;
    swap(h, at, parent);
    at = parent;
  }
}

export function popHeap(h: Heap): number {
  const top = h.items[0];
  h.items[0] = h.items[--h.count];
  let at = 0;
  for (;;) {
    const least = leastOfFamily(h, at);
    if (least === at) return top;
    swap(h, at, least);
    at = least;
  }
}

function leastOfFamily(h: Heap, at: number): number {
  const left = 2 * at + 1;
  let least = at;
  if (left < h.count && below(h, left, least)) least = left;
  if (left + 1 < h.count && below(h, left + 1, least)) least = left + 1;
  return least;
}
