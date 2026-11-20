import { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sourceHash } from "../../../tools/hud-bake/source-hash.mjs";
import { artSet, bakeView, homography, mapPoint, warpTransform, type BakedMeta, type Quad } from "./baked";

const BOXES = new URL("./baked/", import.meta.url);
const PICTURES = new URL("../../../public/hud/baked/", import.meta.url);
const files = readdirSync(BOXES).filter((f) => f.endsWith(".json"));

const read = (file: string): BakedMeta => JSON.parse(readFileSync(new URL(file, BOXES), "utf8")) as BakedMeta;

describe("baked HUD parts", () => {
  it("were baked from the current bake sources. Run npm run hud-bake when this fails.", () => {
    const current = sourceHash();
    expect(files.filter((f) => read(f).source !== current)).toEqual([]);
  });

  it("have every picture their box data names", () => {
    const missing = files.flatMap((file) => {
      const [part, view] = file.split(".");
      const meta = read(file);
      const names = ["housing", ...Object.values(meta.sprites).flatMap((s) => s.frames)];
      return names.flatMap((name) => meta.scales.map((s) => `${part}/${view}/${name}@${s}x.webp`)).filter((p) => !existsSync(new URL(p, PICTURES)));
    });
    expect(missing).toEqual([]);
  });

  it("bake both views of every part", () => {
    const parts = new Set(files.map((f) => f.split(".")[0]));
    for (const part of parts) expect([`${part}.desktop.json`, `${part}.flat.json`].every((f) => files.includes(f))).toBe(true);
  });

  it("use the desktop view only on wide layers", () => {
    expect(bakeView({ width: 1280, height: 720 }, 1.6)).toBe("desktop");
    expect(bakeView({ width: 1024, height: 768 }, 1.6)).toBe("flat");
    expect(bakeView({ width: 600, height: 1024 }, 1.6)).toBe("flat");
  });
});

const TILTED: Quad = [[63.15, 97.12], [1073.35, 97.12], [1071.9, 286.4], [64.2, 287.1]];

describe("warp", () => {
  it("lands each corner of the box on its quad corner", () => {
    const m = homography(1008, 187, TILTED);
    const corners = [[0, 0], [1008, 0], [1008, 187], [0, 187]] as const;
    corners.forEach(([x, y], i) => {
      const [px, py] = mapPoint(m, x, y);
      expect(Math.abs(px - TILTED[i][0])).toBeLessThan(0.01);
      expect(Math.abs(py - TILTED[i][1])).toBeLessThan(0.01);
    });
  });

  it("writes the same matrix as a css matrix3d in column order", () => {
    const m = homography(10, 10, [[0, 0], [20, 0], [20, 20], [0, 20]]);
    expect(warpTransform(10, 10, [[0, 0], [20, 0], [20, 20], [0, 20]])).toBe(`matrix3d(${m[0]},${m[3]},0,${m[6]},${m[1]},${m[4]},0,${m[7]},0,0,1,0,${m[2]},${m[5]},0,1)`);
    expect(m[0]).toBeCloseTo(2);
    expect(m[4]).toBeCloseTo(2);
  });
});

describe("baked art in CSS variables", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves each picture against the page, since a stylesheet in assets/ would resolve a relative one against itself", () => {
    vi.stubGlobal("document", { baseURI: "https://play.test/dev/index.html" });
    expect(artSet([1, 2], (s) => `hud/baked/pieces/desktop/slate@${s}x.webp`, { hashes: {}, base: "./", dev: true })).toBe('image-set(url("https://play.test/dev/hud/baked/pieces/desktop/slate@1x.webp") 1x, url("https://play.test/dev/hud/baked/pieces/desktop/slate@2x.webp") 2x)');
  });
});
