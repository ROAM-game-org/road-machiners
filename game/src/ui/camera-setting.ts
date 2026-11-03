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

export const RENDER_SCALE_KEY = "roam.renderScale";

export const RENDER_SCALES = [1, 0.75, 0.5] as const;

export type RenderScale = (typeof RENDER_SCALES)[number];

export class RenderScaleSetting {
  private current: RenderScale;
  private readonly subscribers = new Set<() => void>();

  constructor(private readonly storage: SettingStore | null) {
    const stored = Number(storage?.getItem(RENDER_SCALE_KEY));
    this.current = RENDER_SCALES.find((scale) => scale === stored) ?? 1;
  }

  scale(): RenderScale {
    return this.current;
  }

  pixelRatio(deviceRatio: number): number {
    return deviceRatio * this.current;
  }

  set(scale: RenderScale): void {
    if (scale === this.current) return;
    this.current = scale;
    this.storage?.setItem(RENDER_SCALE_KEY, String(scale));
    for (const fn of this.subscribers) fn();
  }

  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}

let activeScale = new RenderScaleSetting(null);

export function loadRenderScaleSetting(storage: SettingStore): RenderScaleSetting {
  activeScale = new RenderScaleSetting(storage);
  return activeScale;
}

export function renderScaleSetting(): RenderScaleSetting {
  return activeScale;
}

export function followRenderScale(target: { setPixelRatio(ratio: number): void }, deviceRatio: () => number, refit: () => void): void {
  const apply = () => target.setPixelRatio(activeScale.pixelRatio(deviceRatio()));
  apply();
  activeScale.subscribe(() => {
    apply();
    refit();
  });
}
