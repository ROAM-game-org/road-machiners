import { describe, expect, it } from 'vitest';
import { placeInWorld } from './worldPlace';

function stub() {
  return {
    vertexShader: '#include <common>\nvoid main() {\n#include <project_vertex>\n}',
    fragmentShader: '#include <common>\nvoid main() {}',
  };
}

const count = (text: string, part: string) => text.split(part).length - 1;

describe('placeInWorld', () => {
  it('declares the varying once per stage and writes it once, however often it runs', () => {
    const shader = stub();
    placeInWorld(shader);
    placeInWorld(shader);
    placeInWorld(shader);
    expect(count(shader.vertexShader, 'varying vec2 vWorldXZ;')).toBe(1);
    expect(count(shader.fragmentShader, 'varying vec2 vWorldXZ;')).toBe(1);
    expect(count(shader.vertexShader, 'vWorldXZ = ')).toBe(1);
  });

  it('uses the instance matrix under instancing before the model matrix', () => {
    const shader = stub();
    placeInWorld(shader);
    expect(shader.vertexShader).toContain('#ifdef USE_INSTANCING\nworldPlaceAt = instanceMatrix * worldPlaceAt;');
    expect(shader.vertexShader).toContain('vWorldXZ = (modelMatrix * worldPlaceAt).xz;');
  });
});
