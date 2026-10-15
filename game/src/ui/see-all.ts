let seeing = false;

export function seesAll(): boolean {
  return seeing;
}

export function toggleSeeAll(): boolean {
  seeing = !seeing;
  return seeing;
}

export function resetSeeAll(): void {
  seeing = false;
}
