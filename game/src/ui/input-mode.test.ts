import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../text/msg";
import { resolve } from "../text/resolve";
import { inputModeOf, keyLabel, watchInputMode } from "./input-mode";
import type { UiSize } from "./ui-size";

const layer = (width: number, height: number) => ({ width, height });

function mediaQueries(width: number, height: number) {
  return {
    phone: width <= 560 || height <= 480,
    slim: width <= 480,
    narrow: width <= 720,
    compact: width <= 1100,
  };
}

describe("input mode", () => {
  it("is touch and phone on a portrait phone", () => {
    expect(inputModeOf(true, layer(390, 844))).toEqual({ touch: true, phone: true, slim: true, narrow: true, compact: true });
  });
  it("is touch and phone on a landscape phone", () => {
    expect(inputModeOf(true, layer(844, 390))).toEqual({ touch: true, phone: true, slim: false, narrow: false, compact: true });
  });
  it("is none on a desktop window", () => {
    expect(inputModeOf(false, layer(1280, 720))).toEqual({ touch: false, phone: false, slim: false, narrow: false, compact: false });
  });
  it("is phone on a narrow desktop window only at 560 and below", () => {
    expect(inputModeOf(false, layer(700, 800)).phone).toBe(false);
    expect(inputModeOf(false, layer(500, 800)).phone).toBe(true);
  });
  it("is touch but not phone on a tablet", () => {
    expect(inputModeOf(true, layer(1024, 768))).toMatchObject({ touch: true, phone: false, narrow: false, compact: true });
  });
  it("matches the old media queries at every boundary at size 100%", () => {
    for (const width of [479, 480, 481, 559, 560, 561, 719, 720, 721, 1099, 1100, 1101]) {
      for (const height of [479, 480, 481, 720]) {
        const { touch, ...classes } = inputModeOf(false, layer(width, height));
        expect(touch).toBe(false);
        expect(classes, `${width}x${height}`).toEqual(mediaQueries(width, height));
      }
    }
  });
  it("follows the layer, not the window: the reporter's phone at 80%", () => {
    const window = { width: 798, height: 375 };
    expect(inputModeOf(true, window).phone).toBe(true);
    expect(inputModeOf(true, layer(window.width / 0.8, window.height / 0.8))).toMatchObject({ phone: true, narrow: false, compact: true });
  });
  it("makes a laptop at 130% compact but not narrow", () => {
    expect(inputModeOf(false, layer(1280 / 1.3, 720 / 1.3))).toMatchObject({ phone: false, narrow: false, compact: true });
  });
});

describe("key label", () => {
  afterEach(() => vi.unstubAllGlobals());

  function watch(coarse: boolean): void {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: coarse, addEventListener: () => {} }) });
    const size = { layerSize: () => layer(1280, 720), subscribe: () => () => {} } as unknown as UiSize;
    watchInputMode([{ classList: { toggle: () => {} } } as unknown as HTMLElement], size);
  }

  it("is the plain text under touch", () => {
    watch(true);
    expect(resolve(keyLabel(t("menu.close"), "C"), "en")).toBe("Close");
  });

  it("adds the key cap with a mouse", () => {
    watch(false);
    expect(resolve(keyLabel(t("menu.close"), "C"), "en")).toBe("Close [C]");
  });
});
