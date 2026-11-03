import type { RenderScope } from '../three/render/scope';
import { CellStreamer } from '../three/render/streamer';

export function buildCells(...scopes: RenderScope[]): void {
  new CellStreamer(scopes, () => {}, () => 0, Number.POSITIVE_INFINITY).buildAll();
}

export function buildingOnSync<V extends { sync(...args: never[]): void }>(views: V, ...scopes: RenderScope[]): V {
  const sync = views.sync.bind(views) as (...args: unknown[]) => void;
  Object.assign(views, {
    sync: (...args: unknown[]) => {
      sync(...args);
      buildCells(...scopes);
    },
  });
  return views;
}
