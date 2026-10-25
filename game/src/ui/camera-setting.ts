export const CAMERA_KEY = "roam.camera";

export type CameraMode = "auto" | "centered";

type SettingStore = Pick<Storage, "getItem" | "setItem">;

export class CameraSetting {
  private current: CameraMode;
  private readonly subscribers = new Set<() => void>();

  constructor(private readonly storage: SettingStore | null) {
    this.current = storage?.getItem(CAMERA_KEY) === "centered" ? "centered" : "auto";
  }

  mode(): CameraMode {
    return this.current;
  }

  set(mode: CameraMode): void {
    if (mode === this.current) return;
    this.current = mode;
    this.storage?.setItem(CAMERA_KEY, mode);
    for (const fn of this.subscribers) fn();
  }

  toggle(): void {
    this.set(this.current === "auto" ? "centered" : "auto");
  }

  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}

let active = new CameraSetting(null);

export function loadCameraSetting(storage: SettingStore): CameraSetting {
  active = new CameraSetting(storage);
  return active;
}

export function cameraSetting(): CameraSetting {
  return active;
}
