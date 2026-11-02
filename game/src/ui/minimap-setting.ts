export const MINIMAP_KEY = "roam.minimap";

type SettingStore = Pick<Storage, "getItem" | "setItem">;

export class MinimapSetting {
  private shown: boolean;
  private readonly subscribers = new Set<() => void>();

  constructor(private readonly storage: SettingStore | null) {
    this.shown = storage?.getItem(MINIMAP_KEY) === "on";
  }

  on(): boolean {
    return this.shown;
  }

  set(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.storage?.setItem(MINIMAP_KEY, on ? "on" : "off");
    for (const fn of this.subscribers) fn();
  }

  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}

let active = new MinimapSetting(null);

export function loadMinimapSetting(storage: SettingStore): MinimapSetting {
  active = new MinimapSetting(storage);
  return active;
}

export function minimapSetting(): MinimapSetting {
  return active;
}
