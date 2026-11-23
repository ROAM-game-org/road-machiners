export function runNow<T>(pieces: Generator<string, T>): T {
  for (let step = pieces.next(); ; step = pieces.next()) if (step.done) return step.value;
}

export async function runStepped<T>(pieces: Generator<string, T>, before: (name: string) => Promise<void>): Promise<T> {
  for (let step = pieces.next(); ; step = pieces.next()) {
    if (step.done) return step.value;
    await before(step.value);
  }
}
