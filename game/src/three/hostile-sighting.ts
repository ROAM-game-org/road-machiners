export type Sighting = { sighted: boolean };

export class HostileSighting {
  private seen = new Map<string, number>();

  observe(turn: number, hostiles: readonly string[]): Sighting {
    const sighted = hostiles.some((id) => (this.seen.get(id) ?? -Infinity) < turn - 1);
    for (const [id, last] of this.seen) if (last < turn - 1) this.seen.delete(id);
    for (const id of hostiles) this.seen.set(id, turn);
    return { sighted };
  }
}
