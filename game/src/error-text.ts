export function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const head = `${error.name}: ${error.message}`;
  const stack = error.stack ?? '';
  if (stack.startsWith(head)) return stack;
  return stack ? `${head}\n${stack}` : head;
}
