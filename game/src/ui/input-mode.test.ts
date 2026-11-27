import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../text/msg";
import { resolve } from "../text/resolve";
import { inputModeOf, keyCap, keyLabel, setPadMode, watchInputMode } from "./input-mode";
import type { UiSize } from "./ui-size";

const layer = (width: number, height: number) => ({ width, height });

function mediaQueries(width: number) {
  return {
    slim: width <= 480,
    narrow: width <= 720,
    tight: width <= 880,
    compact: width <= 1100,
  };
}

describe("input mode", () => {
  it("is touch and narrow on a portrait phone", () => {
    expect(inputModeOf(true, layer(390, 844))).toEqual({ touch: true, slim: true, narrow: true, tight: true, compact: true });
  });
  it("is touch and tight on a landscape phone", () => {
    expect(inputModeOf(true, layer(844, 390))).toEqual({ touch: true, slim: false, narrow: false, tight: true, compact: true });
  });
  it("is none on a desktop window", () => {
    expect(inputModeOf(false, layer(1280, 720))).toEqual({ touch: false, slim: false, narrow: false, tight: false, compact: false });
  });
  it("is touch and compact on a tablet", () => {
    expect(inputModeOf(true, layer(1024, 768))).toMatchObject({ touch: true, narrow: false, compact: true });
  });
  it("matches the old media queries at every boundary at size 100%", () => {
    for (const width of [479, 480, 481, 559, 560, 561, 719, 720, 721, 879, 880, 881, 1099, 1100, 1101]) {
      for (const height of [479, 480, 481, 720]) {
        const { touch, ...classes } = inputModeOf(false, layer(width, height));
        expect(touch).toBe(false);
        expect(classes, `${width}x${height}`).toEqual(mediaQueries(width));
      }
    }
  });
  it("follows the layer, not the window: the reporter's phone at 80%", () => {
    const window = { width: 798, height: 375 };
    expect(inputModeOf(true, window)).toMatchObject({ narrow: false, tight: true });
    expect(inputModeOf(true, layer(window.width / 0.8, window.height / 0.8))).toMatchObject({ narrow: false, tight: false, compact: true });
  });
  it("makes a laptop at 130% compact but not narrow", () => {
    expect(inputModeOf(false, layer(1280 / 1.3, 720 / 1.3))).toMatchObject({ narrow: false, compact: true });
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

  describe("while a gamepad drives", () => {
    function watchPad(): void {
      watch(false);
      vi.stubGlobal("document", { documentElement: { classList: { toggle: () => {} } } });
      setPadMode(true);
    }

    afterEach(() => setPadMode(false));

    it("names the pad button for a key the pad has", () => {
      watchPad();
      expect(resolve(keyLabel(t("menu.close"), "Esc"), "en")).toBe("Close [B]");
      expect(resolve(keyLabel(t("menu.close"), "Space"), "en")).toBe("Close [RT]");
    });

    it("drops the cap of a key no pad button sends", () => {
      watchPad();
      expect(resolve(keyLabel(t("menu.close"), "C"), "en")).toBe("Close");
      expect(keyCap("C")).toBeNull();
    });

    it("goes back to key caps once the pad lets go", () => {
      watchPad();
      setPadMode(false);
      expect(resolve(keyLabel(t("menu.close"), "Esc"), "en")).toBe("Close [Esc]");
    });
  });
});
