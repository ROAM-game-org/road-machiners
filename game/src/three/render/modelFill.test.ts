import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TIME } from '../../data/time';
import { CloudShadows } from './cloudShadows';
import { daylightAt } from './daylight';
import { withCut } from './armorCut';
import { topCut } from './armorTop';
import { ModelFill } from './modelFill';
import { RenderScope, SightLimit } from './scope';

const SIZE = 64;
const turnAt = (hour: number) => 1 + ((hour - TIME.startHour + 24) % 24) * (TIME.turnsPerDay / 24);

function lambertShader(material: THREE.Material) {
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: THREE.ShaderLib.lambert.vertexShader,
    fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
  };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return shader;
}

function meshOf(material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(), material);
}

describe('model fill', () => {
  it('lights camera-facing faces of a Lambert shader through one uniform and keys the program', () => {
    const material = new THREE.MeshLambertMaterial();
    new ModelFill().shadeTree(meshOf(material));
    const shader = lambertShader(material);
    expect(Object.keys(shader.uniforms).filter((key) => !key.startsWith('ink'))).toEqual(['modelFill']);
    expect(shader.fragmentShader).toContain('reflectedLight.indirectDiffuse += modelFill * max(normal.z, 0.0)');
    expect(material.customProgramCacheKey()).toContain('|fill');
  });

  it('keeps lamp and emissive light out of the ink rescale so headlights and lit glass still glow', () => {
    const material = new THREE.MeshLambertMaterial();
    new ModelFill().shadeTree(meshOf(material));
    const source = lambertShader(material).fragmentShader;
    const at = (code: string) => {
      const index = source.indexOf(code);
      expect(index, code).toBeGreaterThan(-1);
      return index;
    };
    expect(at('totalEmissiveRadiance = vec3(0.0);')).toBeGreaterThan(at('#include <emissivemap_fragment>'));
    expect(at('reflectedLight.directDiffuse = vec3(0.0);')).toBeGreaterThan(at('NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )'));
    expect(at('reflectedLight.directDiffuse = vec3(0.0);')).toBeLessThan(at('NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )'));
    expect(at('inkToScreen(inkAtLevel(albedo, lit, level, 1.0) + inkLamp)')).toBeGreaterThan(-1);
    expect(at('inkToScreen(inkGlow)')).toBeGreaterThan(at('vivid * vec3(0.5, 0.5, 0.66)'));
  });

  it('patches a material once and keeps the cloud patch beside it', () => {
    const material = new THREE.MeshLambertMaterial();
    const fill = new ModelFill();
    new CloudShadows().shade(material);
    fill.shadeTree(meshOf(material));
    fill.shadeTree(meshOf(material));
    expect(material.customProgramCacheKey().match(/\|fill/g)).toHaveLength(1);
    const shader = lambertShader(material);
    expect(shader.fragmentShader).toContain('cloudDim()');
    expect(shader.fragmentShader).toContain('modelFill *');
  });

  it('patches an armor cut copy of a patched material once', () => {
    const fill = new ModelFill();
    const material = new THREE.MeshLambertMaterial();
    fill.shadeTree(meshOf(material));
    const copy = withCut(material, { wheels: [], lamps: [], top: topCut({ cell: 0.1, i0: 0, j0: 0, top: [[40]] }, { along: [], across: [] }), stripe: new THREE.Color(), stripeFloor: 0 });
    fill.shadeTree(meshOf(copy));
    const shader = lambertShader(copy);
    expect(shader.fragmentShader.match(/uniform vec3 modelFill;/g)).toHaveLength(1);
    expect(shader.fragmentShader.match(/modelFill \*/g)).toHaveLength(1);
  });

  it('follows the sky color, strong by day and faint at night', () => {
    const fill = new ModelFill();
    const material = new THREE.MeshLambertMaterial();
    fill.shadeTree(meshOf(material));
    const shader = lambertShader(material);
    const value = () => (shader.uniforms.modelFill as { value: THREE.Color }).value.clone();
    const noon = daylightAt(turnAt(12));
    fill.sync(noon);
    expect(value().equals(noon.sky.clone().multiplyScalar(noon.fillIntensity))).toBe(true);
    fill.sync(daylightAt(turnAt(23.5)));
    expect(value().r).toBeGreaterThan(0);
    expect(value().r * 4).toBeLessThan(noon.sky.r * noon.fillIntensity);
  });

  it('reaches models in a model scope and leaves the ground scope alone', () => {
    const model = new THREE.MeshLambertMaterial();
    const ground = new THREE.MeshLambertMaterial();
    new RenderScope(new THREE.Group(), SIZE, new SightLimit(SIZE), true, true).add(meshOf(model), { x: 0, y: 0 }, 1);
    new RenderScope(new THREE.Group(), SIZE, new SightLimit(SIZE), false, false).add(meshOf(ground), { x: 0, y: 0 }, 1);
    expect(model.customProgramCacheKey()).toContain('|fill');
    expect(ground.customProgramCacheKey()).not.toContain('|fill');
  });
});
