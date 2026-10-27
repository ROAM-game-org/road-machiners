export type Sighting = { sighted: boolean };

export class HostileSighting {
  private seen = new Map<string, number>();

  constructor(private readonly memoryTurns = 1) {}

  observe(turn: number, hostiles: readonly string[], known: readonly string[] = []): Sighting {
    const since = turn - this.memoryTurns;
    const sighted = hostiles.some((id) => (this.seen.get(id) ?? -Infinity) < since);
    for (const [id, last] of this.seen) if (last < since) this.seen.delete(id);
    for (const id of [...hostiles, ...known]) this.seen.set(id, turn);
    return { sighted };
  }
}
