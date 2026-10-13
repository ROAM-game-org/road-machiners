import type { Obstacle } from '../types';

type ObstacleMark = { id: string; x: number; y: number; r: number; shape: string };

function shapeOf(o: Obstacle): string {
  return o.kind === 'landmark' ? `${o.look}:${o.yaw}` : o.kind;
}

function marksOf(obstacles: readonly Obstacle[]): ObstacleMark[] {
  return obstacles.map((o) => ({ id: o.id, x: o.pos.x, y: o.pos.y, r: o.r, shape: shapeOf(o) }));
}

function sameMarks(marks: readonly ObstacleMark[], obstacles: readonly Obstacle[]): boolean {
  if (marks.length !== obstacles.length) return false;
  for (let i = 0; i < marks.length; i++) if (!marksObstacle(marks[i], obstacles[i])) return false;
  return true;
}

function marksObstacle(m: ObstacleMark, o: Obstacle): boolean {
  return m.id === o.id && m.x === o.pos.x && m.y === o.pos.y && m.r === o.r && m.shape === shapeOf(o);
}

type CacheEntry<T> = { marks: ObstacleMark[]; scope: unknown; value: T };

export class ObstacleCache<T> {
  private entries: CacheEntry<T>[] = [];
  private readonly proven = new WeakMap<readonly Obstacle[], { entry: CacheEntry<T>; length: number }>();

  constructor(private readonly kept: number) {}

  get(obstacles: readonly Obstacle[], scope: unknown, build: () => T): T {
    const link = this.proven.get(obstacles);
    if (link && link.length === obstacles.length && link.entry.scope === scope) {
      const at = this.entries.indexOf(link.entry);
      if (at >= 0) return this.promote(at).value;
    }
    const at = this.entries.findIndex((e) => e.scope === scope && sameMarks(e.marks, obstacles));
    const entry = at >= 0 ? this.promote(at) : this.add({ marks: marksOf(obstacles), scope, value: build() });
    this.proven.set(obstacles, { entry, length: obstacles.length });
    return entry.value;
  }

  private promote(at: number): CacheEntry<T> {
    if (at > 0) this.entries.unshift(...this.entries.splice(at, 1));
    return this.entries[0];
  }

  private add(entry: CacheEntry<T>): CacheEntry<T> {
    this.entries.unshift(entry);
    this.entries.length = Math.min(this.entries.length, this.kept);
    return entry;
  }
}
