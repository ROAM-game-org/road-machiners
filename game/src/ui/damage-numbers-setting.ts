export const DAMAGE_NUMBERS_KEY = "roam.damageNumbers";

type SettingStore = Pick<Storage, "getItem" | "setItem">;

export class DamageNumbersSetting {
  private shown: boolean;
  private readonly subscribers = new Set<() => void>();

  constructor(private readonly storage: SettingStore | null) {
    this.shown = storage?.getItem(DAMAGE_NUMBERS_KEY) !== "off";
  }

  on(): boolean {
    return this.shown;
  }

  set(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.storage?.setItem(DAMAGE_NUMBERS_KEY, on ? "on" : "off");
    for (const fn of this.subscribers) fn();
  }

  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}

let active = new DamageNumbersSetting(null);

export function loadDamageNumbersSetting(storage: SettingStore): DamageNumbersSetting {
  active = new DamageNumbersSetting(storage);
  return active;
}

export function damageNumbersSetting(): DamageNumbersSetting {
  return active;
}
