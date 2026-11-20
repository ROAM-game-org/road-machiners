import { describe, expect, it } from 'vitest';
import { drawsInSoftware } from './renderer-kind';

describe('drawsInSoftware', () => {
  it.each([
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    'ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'Software Rasterizer',
  ])('names software drawing in %s', (renderer) => {
    expect(drawsInSoftware(renderer)).toBe(true);
  });

  it.each([
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 (0x00002206) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, Vulkan 1.3.0 (NVIDIA GeForce GTX 1660 Ti (0x00002182)), NVIDIA)',
    'ANGLE (AMD, Radeon RX 6800 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'Apple M2',
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
    'Intel(R) UHD Graphics 620',
  ])('leaves the graphics card in %s alone', (renderer) => {
    expect(drawsInSoftware(renderer)).toBe(false);
  });
});
