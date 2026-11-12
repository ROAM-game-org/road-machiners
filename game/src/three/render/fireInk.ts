import * as THREE from 'three';
import { TUNING } from './inkTuning';
import { CARD_CLOCK } from './particles/cards';

export const FIRE_KNOB_UNIFORMS = ["fireEdge", "fireBandStep", "fireLines", "fireLinePx", "fireTongue", "fireTongueSize", "fireTongueSpeed"] as const;

export const FIRE_RIM = { inner: 0.25, outer: 1 };
const FIRE_COLORS = { red: 0xc8281a, orange: 0xf06e1c, yellow: 0xffc23a, core: 0xfff1b0, line: 0x3a0c06 };
const TONGUE = { stretch: 2.5, second: 2.3, secondShare: 0.35, sideShare: 0.4 };
const LOWEST_LEVEL = -4;
const LEVELS = { yellow: 1, core: 3.2 };

const f = (n: number) => n.toFixed(3);

export function fireUniforms(): Record<string, THREE.IUniform> & { fire: { value: THREE.Texture | null } } {
  return {
    fire: { value: null },
    ...Object.fromEntries(FIRE_KNOB_UNIFORMS.map((key) => [key, TUNING[key]])),
    fireSeconds: CARD_CLOCK,
    fireRed: { value: new THREE.Color(FIRE_COLORS.red) },
    fireOrange: { value: new THREE.Color(FIRE_COLORS.orange) },
    fireYellow: { value: new THREE.Color(FIRE_COLORS.yellow) },
    fireCore: { value: new THREE.Color(FIRE_COLORS.core) },
    fireLine: { value: new THREE.Color(FIRE_COLORS.line) },
  };
}

export const FIRE_PAINT = `
uniform sampler2D fire;
uniform float fireSeconds;
uniform vec3 fireRed;
uniform vec3 fireOrange;
uniform vec3 fireYellow;
uniform vec3 fireCore;
uniform vec3 fireLine;
${FIRE_KNOB_UNIFORMS.map((key) => `uniform float ${key};\n`).join("")}float fireHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float fireNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 t = fract(p);
  t = t * t * (3.0 - 2.0 * t);
  return mix(mix(fireHash(cell), fireHash(cell + vec2(1.0, 0.0)), t.x), mix(fireHash(cell + vec2(0.0, 1.0)), fireHash(cell + vec2(1.0, 1.0)), t.x), t.y);
}
float fireLick(vec2 p) {
  return fireNoise(p) * (1.0 - ${f(TONGUE.secondShare)}) + fireNoise(p * ${f(TONGUE.second)} + 17.0) * ${f(TONGUE.secondShare)};
}
vec2 fireWarp(vec2 meters) {
  vec2 p = vec2(meters.x, meters.y / ${f(TONGUE.stretch)} - fireSeconds * fireTongueSpeed) / fireTongueSize;
  float up = fireLick(p);
  float side = fireLick(p + vec2(31.0, 7.0)) - 0.5;
  return vec2(side * ${f(TONGUE.sideShare)}, -up) * fireTongue;
}
float fireStep(float x, float at) {
  float w = fwidth(x) * 0.75 + 0.0001;
  return smoothstep(at - w, at + w, x);
}
float fireRing(float level, float at) {
  float w = fwidth(level);
  float half_ = fireLinePx * 0.5;
  return (1.0 - smoothstep(w * half_, w * (half_ + 1.0), abs(level - at)));
}
vec3 paintFire(vec3 base, vec2 meters) {
  vec4 here = texture2D(fire, vUv + fireWarp(meters) * uvPerMeter);
  float cover = fireStep(here.a, fireEdge);
  float level = max(${f(LOWEST_LEVEL)}, log(max(here.g, 0.00001) / fireEdge) / log(fireBandStep));
  vec3 color = mix(fireRed, fireOrange, fireStep(level, 0.0));
  color = mix(color, fireYellow, fireStep(level, ${f(LEVELS.yellow)}));
  color = mix(color, fireCore, fireStep(level, ${f(LEVELS.core)}));
  float line = max(fireRing(level, 0.0), fireRing(level, ${f(LEVELS.yellow)})) * fireLines;
  color = mix(color, fireLine, line);
  return mix(base, color, cover);
}
`;
