import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const GALLERY = "docs/screens";

function listedImages(): string[] {
  const readme = readFileSync(`${GALLERY}/README.md`, "utf8");
  return [...readme.matchAll(/^- `([a-z-]+\.jpg)`/gm)].map((match) => match[1]);
}

describe("screens gallery", () => {
  it("has an image for every listed screen", () => {
    const missing = listedImages().filter((name) => !existsSync(`${GALLERY}/${name}`));
    expect(missing).toEqual([]);
  });

  it("lists every image", () => {
    const listed = new Set(listedImages());
    const unlisted = readdirSync(GALLERY).filter((name) => name.endsWith(".jpg") && !listed.has(name));
    expect(unlisted).toEqual([]);
  });
});
