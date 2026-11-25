import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PulseWavePass, waveFrame } from './pulseWave';
import type { PulseWave } from './pulse';

function camera(zoom: number): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(-16, 16, 9, -9, 0.1, 400);
  cam.zoom = zoom;
  cam.position.set(40, 40, 40);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
}

const wave = (x: number, z: number, strength: number): PulseWave => ({ at: { x, y: 0.5, z }, radiusM: 5, strength, clockS: 1 });

describe('waveFrame', () => {
  it('is null with no live wave', () => {
    expect(waveFrame([], camera(1))).toBeNull();
    expect(waveFrame([wave(0, 0, 0)], camera(1))).toBeNull();
  });

  it('puts the wave center on the screen spot of its ground point', () => {
    const cam = camera(1.7);
    const frame = waveFrame([wave(3, -2, 1)], cam);
    const projected = new THREE.Vector3(3, 0.5, -2).project(cam);
    expect(frame?.first.x).toBeCloseTo(projected.x * 0.5 + 0.5, 6);
    expect(frame?.first.y).toBeCloseTo(projected.y * 0.5 + 0.5, 6);
  });

  it('maps a screen step to ground meters that shrink exactly with zoom', () => {
    const near = waveFrame([wave(0, 0, 1)], camera(1))!.groundPerUv;
    const far = waveFrame([wave(0, 0, 1)], camera(3))!.groundPerUv;
    expect(far.x).toBeCloseTo(near.x / 3, 6);
    expect(far.y).toBeCloseTo(near.y / 3, 6);
    expect(far.z).toBeCloseTo(near.z / 3, 6);
    expect(far.w).toBeCloseTo(near.w / 3, 6);
  });

  it('maps ground back to the screen so the two maps multiply to the identity', () => {
    const f = waveFrame([wave(0, 0, 1)], camera(2))!;
    const g = f.groundPerUv;
    const u = f.uvPerGround;
    expect(u.x * g.x + u.z * g.y).toBeCloseTo(1, 6);
    expect(u.y * g.x + u.w * g.y).toBeCloseTo(0, 6);
    expect(u.x * g.z + u.z * g.w).toBeCloseTo(0, 6);
    expect(u.y * g.z + u.w * g.w).toBeCloseTo(1, 6);
  });

  it('keeps the two strongest of three waves', () => {
    const f = waveFrame([wave(0, 0, 0.2), wave(1, 0, 0.9), wave(2, 0, 0.5)], camera(1))!;
    expect([f.first.w, f.second.w]).toEqual([0.9, 0.5]);
  });
});

describe('the wave shader', () => {
  it('has no array and one varying and one sampler', () => {
    const source = fragmentSource();
    expect(source).not.toContain('[');
    expect(source.match(/uniform sampler2D/g)).toHaveLength(1);
    expect(source.match(/varying /g)).toHaveLength(1);
  });
});

function fragmentSource(): string {
  const renderer = { getDrawingBufferSize: (v: THREE.Vector2) => v.set(2, 2), getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {} } as unknown as THREE.WebGLRenderer;
  const pass = new PulseWavePass(renderer) as unknown as { material: THREE.ShaderMaterial };
  return pass.material.fragmentShader;
}
