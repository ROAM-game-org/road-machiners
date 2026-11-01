import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHASSIS } from "../data/chassis";
import { SPRITES, spritePlan, type SpriteManifest } from "./sim-sprite-plan";

const REBAKE = "Run npm run sim:sprites.";
const FOLDER = `public/${SPRITES.folder}`;
const MANIFEST = JSON.parse(readFileSync(`${FOLDER}/${SPRITES.manifest}`, "utf8")) as SpriteManifest;
const WEBP_HEADER = ["RIFF", "WEBP"];

describe("sim sprites", () => {
  it("were baked at the sizes the page expects", () => {
    expect([MANIFEST.yaws, MANIFEST.pxPerMeter], REBAKE).toEqual([SPRITES.yaws, SPRITES.pxPerMeter]);
  });

  it("list exactly the chassis of the game", () => {
    expect(MANIFEST.chassis, REBAKE).toEqual(Object.keys(CHASSIS).sort());
  });

  it("cover every chassis and every paint a truck can wear", () => {
    expect(Object.keys(MANIFEST.sprites).sort(), REBAKE).toEqual(spritePlan().map((want) => want.key).sort());
  });

  it("give every chassis at least one sprite", () => {
    const drawn = new Set(Object.keys(MANIFEST.sprites).map((key) => key.slice(0, key.indexOf("-"))));
    for (const id of Object.keys(CHASSIS)) expect(drawn.has(id), `${id} has no sprite. ${REBAKE}`).toBe(true);
  });

  it("hold every heading of every sprite in a webp sheet", () => {
    for (const [key, entry] of Object.entries(MANIFEST.sprites)) {
      const path = `${FOLDER}/${entry.file}`;
      expect(existsSync(path), `${path} is missing. ${REBAKE}`).toBe(true);
      const bytes = readFileSync(path);
      expect([bytes.subarray(0, 4).toString("latin1"), bytes.subarray(8, 12).toString("latin1")], path).toEqual(WEBP_HEADER);
      expect(entry.cells.length, `${key} cells`).toBe(SPRITES.yaws);
    }
  });
});
