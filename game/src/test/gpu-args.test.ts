import { afterEach, describe, expect, it } from 'vitest';
import { gpuArgs } from '../../scripts/gpu.mjs';

const real = process.platform;

function onPlatform(name: string): void {
  Object.defineProperty(process, 'platform', { value: name });
}

afterEach(() => onPlatform(real));

describe('gpuArgs', () => {
  it('asks Windows for ANGLE D3D11 on request, with no Vulkan flags', () => {
    onPlatform('win32');
    const args = gpuArgs('d3d11');
    expect(args).toContain('--use-angle=d3d11');
    expect(args?.join(' ')).not.toMatch(/vulkan/i);
  });

  it('keeps Vulkan as the Windows default', () => {
    onPlatform('win32');
    expect(gpuArgs()).toContain('--use-angle=vulkan');
  });

  it('refuses D3D11 off Windows', () => {
    onPlatform('linux');
    expect(() => gpuArgs('d3d11')).toThrow('D3D11 exists only on Windows');
  });
});
