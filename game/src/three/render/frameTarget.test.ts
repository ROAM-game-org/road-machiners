import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FRAME_SAMPLES, frameTarget } from "./frameTarget";

describe("frameTarget", () => {
  it("resolves depth for a pass that reads it and never resolves stencil", () => {
    const depthTexture = new THREE.DepthTexture(1, 1);
    const target = frameTarget({ depthRead: true, depthTexture });
    expect(target.samples).toBe(FRAME_SAMPLES);
    expect(target.resolveDepthBuffer).toBe(true);
    expect(target.resolveStencilBuffer).toBe(false);
    expect(target.depthTexture).toBe(depthTexture);
  });

  it("resolves neither depth nor stencil for a color-only target", () => {
    const target = frameTarget({ depthRead: false });
    expect(target.resolveDepthBuffer).toBe(false);
    expect(target.resolveStencilBuffer).toBe(false);
    expect(target.stencilBuffer).toBe(true);
  });

  it("refuses to resolve depth that no texture reads", () => {
    expect(() => frameTarget({ depthRead: true })).toThrow("needs a depth texture");
  });
});
