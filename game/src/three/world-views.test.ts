import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { firstFramePieces, groundTextures, type FirstFrameHost } from './world-views';
import { runStepped } from './render/stepped';

function fakeTexture(name: string): THREE.Texture {
  return { isTexture: true, name } as unknown as THREE.Texture;
}

function recordingHost(events: string[]): FirstFrameHost {
  return {
    upload: (texture) => events.push(`upload ${texture.name}`),
    compile: () => events.push('compile'),
    fillGroundCache: () => events.push('fill ground cache'),
    drawFirstFrame: () => events.push('draw first frame'),
  };
}

describe('the first frame boot pieces', () => {
  it('marks each piece before doing it and draws the frame last', async () => {
    const events: string[] = [];
    const textures: [string, THREE.Texture][] = [['heights', fakeTexture('heights')], ['tints', fakeTexture('tints')]];

    await runStepped(firstFramePieces(textures, recordingHost(events)), async (piece) => {
      events.push(`mark ${piece}`);
    });

    expect(events).toEqual([
      'mark uploading heights',
      'upload heights',
      'mark uploading tints',
      'upload tints',
      'mark compiling the shaders',
      'compile',
      'mark drawing the ground cache',
      'fill ground cache',
      'mark drawing the first frame',
      'draw first frame',
    ]);
  });

  it('uploads only the textures among the ground uniforms and extras', () => {
    const heights = fakeTexture('heights');
    const pools = fakeTexture('pools');

    const named = groundTextures({ heights: { value: heights }, span: { value: 3 }, empty: { value: null } }, { pools, missing: null });

    expect(named).toEqual([
      ['heights', heights],
      ['pools', pools],
    ]);
  });
});
