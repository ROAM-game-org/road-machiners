import type { LogView } from "./log";

export const LOG_VIEW_KEY = "roam.logView";

type SettingStore = Pick<Storage, "getItem" | "setItem">;

export class LogViewSetting {
  private current: LogView;
  private readonly subscribers = new Set<() => void>();

  constructor(private readonly storage: SettingStore | null) {
    this.current = storage?.getItem(LOG_VIEW_KEY) === "verbose" ? "verbose" : "brief";
  }

  view(): LogView {
    return this.current;
  }

  set(view: LogView): void {
    if (view === this.current) return;
    this.current = view;
    this.storage?.setItem(LOG_VIEW_KEY, view);
    for (const fn of this.subscribers) fn();
  }

  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}

let active = new LogViewSetting(null);

export function loadLogViewSetting(storage: SettingStore): LogViewSetting {
  active = new LogViewSetting(storage);
  return active;
}

export function logViewSetting(): LogViewSetting {
  return active;
}
