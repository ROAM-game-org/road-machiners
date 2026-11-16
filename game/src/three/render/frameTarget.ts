import * as THREE from "three";

export const FRAME_SAMPLES = 4;

export interface FrameTargetOptions {
  depthRead: boolean;
  depthTexture?: THREE.DepthTexture;
}

export function frameTarget(options: FrameTargetOptions): THREE.WebGLRenderTarget {
  if (options.depthRead && !options.depthTexture) throw new Error("A per-frame target that resolves depth needs a depth texture to read it");
  return new THREE.WebGLRenderTarget(1, 1, {
    samples: FRAME_SAMPLES,
    type: THREE.UnsignedByteType,
    colorSpace: THREE.SRGBColorSpace,
    depthBuffer: true,
    stencilBuffer: true,
    resolveDepthBuffer: options.depthRead,
    resolveStencilBuffer: false,
    ...(options.depthTexture ? { depthTexture: options.depthTexture } : {}),
  });
}
