import * as THREE from 'three';
import { FIRE_PAINT, FIRE_RIM, fireUniforms } from './fireInk';
import { TUNING } from './inkTuning';
import { INK_SHADE } from './particles/cardShaders';
import { CardBatch, type CardLight } from './particles/cards';

const SCENE_SAMPLES = 4;
const DENSITY_SCALE = 0.5;
const MASS = { thickAt: 2, litSky: 0.6 };
const LIGHT = { steps: 3, up: 0.6, under: { from: 0.2, to: 0.8 } };
const BILLOW_FALL_FROM = 0.3;
const ACCENT = { strength: 1.3, probeMeters: 0.2, facing: 0.15, bendMeters: 0.25 };
const STREAKS = { first: 1.7, blurMeters: 0.25, thick: { meters: 0.6, from: 1.0, to: 1.3 }, bend: { from: -0.06, to: 0.04 } };
const KNOB_UNIFORMS = ["dustEdge", "dustThin", "dustThick", "dustShade", "dustShadeReach", "dustBands", "dustBandStep", "dustBandShade", "dustLines", "dustStreaks", "dustStreakPx", "dustStreakDark", "bankShade", "bankLines", "bankCool"] as const;
const COOL_SHADE = [0.6, 0.72, 0.95];

const f = (n: number) => n.toFixed(3);

type Billow = { edge: string; thin: string; thick: string; shade: string; shadeReach: string; bands: string; bandStep: string; bandShade: string; lines: string; streaks: string; streakPx: string; streakDark: string; cool: string };

const DUST_BILLOW: Billow = { edge: 'dustEdge', thin: 'dustThin', thick: 'dustThick', shade: 'dustShade', shadeReach: 'dustShadeReach', bands: 'dustBands', bandStep: 'dustBandStep', bandShade: 'dustBandShade', lines: 'dustLines', streaks: 'dustStreaks', streakPx: 'dustStreakPx', streakDark: 'dustStreakDark', cool: '0.0' };
const BANK_BILLOW: Billow = { ...DUST_BILLOW, shade: 'bankShade', lines: 'bankLines', cool: 'bankCool' };

function billowPaint(mass: string, k: Billow): string {
  return `
float ${mass}DensityAt(vec2 meters) {
  return texture2D(${mass}, vUv + meters * uvPerMeter).a;
}
float ${mass}Outside(vec2 meters) {
  return 1.0 - smoothstep(${k.edge} * 0.6, ${k.edge} * 1.2, ${mass}DensityAt(meters));
}
float ${mass}FacesSun(vec2 toSun, float a) {
  return smoothstep(0.0, ${f(ACCENT.facing)}, (a - ${mass}DensityAt(toSun * ${f(ACCENT.probeMeters)})) / max(a, 0.0001));
}
float ${mass}Line(float u, float keep) {
  float du = fwidth(u);
  float half_ = ${k.streakPx} * 0.5 * keep;
  return 1.0 - smoothstep(du * half_, du * (half_ + 1.0), abs(u - floor(u + 0.5)));
}
float ${mass}Convexity(float a) {
  float r = ${f(ACCENT.bendMeters)};
  float e = ${mass}DensityAt(vec2(r, 0.0));
  float w = ${mass}DensityAt(vec2(-r, 0.0));
  float n = ${mass}DensityAt(vec2(0.0, r));
  float s = ${mass}DensityAt(vec2(0.0, -r));
  float gx = (e - w) * 0.5;
  float gy = (n - s) * 0.5;
  float gxx = e + w - 2.0 * a;
  float gyy = n + s - 2.0 * a;
  float gxy = (${mass}DensityAt(vec2(r, r)) - ${mass}DensityAt(vec2(r, -r)) - ${mass}DensityAt(vec2(-r, r)) + ${mass}DensityAt(vec2(-r, -r))) * 0.25;
  float g2 = gx * gx + gy * gy;
  return -(gxx * gy * gy - 2.0 * gxy * gx * gy + gyy * gx * gx) / max(pow(g2, 1.5), 0.00001);
}
vec3 ${mass}Paint(vec3 base, vec2 toSun) {
  vec4 here = texture2D(${mass}, vUv);
  float a = here.a;
  float aa = fwidth(a) * 0.75 + 0.0001;
  float cover = smoothstep(${k.edge} - aa, ${k.edge} + aa, a);
  if (cover <= 0.0) return base;
  float under = 0.0;
  for (int i = 1; i <= ${LIGHT.steps}; i++) under += ${mass}Outside(-toSun * ${k.shadeReach} * float(i));
  under /= ${LIGHT.steps}.0;
  vec3 tone = here.rgb / max(a, 0.0001);
  vec3 sunlit = tone * (sunColor + mix(groundColor, skyColor, 0.75) * ${f(MASS.litSky)}) * ${(1 / Math.PI).toFixed(6)};
  vec3 shaded = mix(sunlit, inkShade(sunlit), ${k.shade});
  shaded = mix(shaded, shaded * vec3(${COOL_SHADE.map(f).join(', ')}), ${k.cool});
  float u = min(log(max(a, 0.0001) / ${k.edge}) / log(${k.bandStep}), ${k.bands});
  float lowerPart = smoothstep(${f(BILLOW_FALL_FROM)}, 1.0, fract(max(u, 0.0))) * ${k.bandShade} * step(u, ${k.bands} - 0.001);
  float shade = max(smoothstep(${f(LIGHT.under.from)}, ${f(LIGHT.under.to)}, under), lowerPart);
  vec3 color = mix(sunlit, shaded, shade);
  float opacity = mix(${k.thin}, ${k.thick}, smoothstep(${k.edge}, ${k.edge} * ${f(MASS.thickAt)}, a));
  vec3 painted = mix(base, color, cover * opacity);
  float b = ${f(STREAKS.blurMeters)};
  float smooth_ = (a + ${mass}DensityAt(vec2(b, 0.0)) + ${mass}DensityAt(vec2(-b, 0.0)) + ${mass}DensityAt(vec2(0.0, b)) + ${mass}DensityAt(vec2(0.0, -b))) / 5.0;
  float streakU = log(max(smooth_, 0.0001) / (${k.edge} * ${f(STREAKS.first)})) / log(${k.bandStep});
  float inside = step(-0.5, streakU) * step(streakU, ${k.streaks} - 0.5);
  float thick = smoothstep(smooth_ * ${f(STREAKS.thick.from)}, smooth_ * ${f(STREAKS.thick.to)}, ${mass}DensityAt(-toSun * ${f(STREAKS.thick.meters)}));
  float keep = smoothstep(${f(STREAKS.bend.from)}, ${f(STREAKS.bend.to)}, ${mass}Convexity(smooth_)) * ${mass}FacesSun(toSun, smooth_) * thick;
  float ink = clamp(${mass}Line(streakU, keep) * keep * inside * ${k.lines} * ${f(ACCENT.strength)}, 0.0, 1.0);
  return mix(painted, shaded * (1.0 - ${k.streakDark}), ink);
}`;
}

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAGMENT = `
uniform sampler2D sceneColor;
uniform sampler2D dust;
uniform sampler2D bank;
uniform vec2 uvPerMeter;
uniform vec3 sunView;
uniform vec3 sunColor;
uniform vec3 skyColor;
uniform vec3 groundColor;
${KNOB_UNIFORMS.map((key) => `uniform float ${key};\n`).join("")}varying vec2 vUv;
${INK_SHADE}
${FIRE_PAINT}
vec2 lightDir() {
  float across = smoothstep(0.02, 0.2, length(sunView.xy));
  vec2 flatSun = sunView.xy / max(length(sunView.xy), 0.0001) * across;
  return normalize(vec2(0.0, ${f(LIGHT.up)}) + flatSun);
}
${billowPaint('dust', DUST_BILLOW)}
${billowPaint('bank', BANK_BILLOW)}
void main() {
  vec4 scene = texture2D(sceneColor, vUv);
  vec2 toSun = lightDir();
  vec3 base = paintFire(scene.rgb, vUv / uvPerMeter);
  base = bankPaint(base, toSun);
  base = dustPaint(base, toSun);
  gl_FragColor = vec4(base, scene.a);
  #include <colorspace_fragment>
}`;

function densityBatch(shapes: THREE.Texture, capacity: number, fillScreens: number): CardBatch {
  return new CardBatch(capacity, 'density', shapes, fillScreens / (DENSITY_SCALE * DENSITY_SCALE));
}

class DensityPass {
  readonly target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  private readonly scene = new THREE.Scene();
  private readonly clearColor = new THREE.Color();

  constructor(readonly batches: readonly CardBatch[]) {
    for (const b of batches) this.scene.add(b.mesh);
  }

  holds(): boolean {
    return this.batches.some((b) => b.drawn() > 0);
  }

  fit(size: THREE.Vector2): void {
    if (this.target.width !== size.x || this.target.height !== size.y) this.target.setSize(size.x, size.y);
  }

  draw(renderer: THREE.WebGLRenderer, camera: THREE.OrthographicCamera, depth: THREE.DepthTexture, size: THREE.Vector2): void {
    for (const b of this.batches) b.readDepth(depth, size, camera);
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, camera);
    renderer.autoClear = autoClear;
    renderer.setClearColor(this.clearColor, alpha);
  }
}

export class InkLayer {
  readonly dust: CardBatch;
  readonly bank: CardBatch;
  readonly fire: CardBatch;
  private readonly passes: readonly DensityPass[];
  private readonly sceneTarget: THREE.WebGLRenderTarget;
  private readonly uniforms = {
    sceneColor: { value: null as THREE.Texture | null },
    dust: { value: null as THREE.Texture | null },
    bank: { value: null as THREE.Texture | null },
    ...fireUniforms(),
    uvPerMeter: { value: new THREE.Vector2(1, 1) },
    sunView: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color() },
    skyColor: { value: new THREE.Color() },
    groundColor: { value: new THREE.Color() },
    ...Object.fromEntries(KNOB_UNIFORMS.map((key) => [key, TUNING[key]])),
    shadeDark: TUNING.shadeDark,
    shadeShift: TUNING.shadeShift,
    castDark: TUNING.castDark,
  };
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: this.uniforms, depthTest: false, depthWrite: false }));
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly sunWorld = new THREE.Vector3(0, 1, 0);
  private readonly size = new THREE.Vector2();
  private readonly densitySize = new THREE.Vector2();

  constructor(shapes: THREE.Texture, capacity: { dust: number; bank: number; fire: number }, fillScreens: number) {
    this.dust = densityBatch(shapes, capacity.dust, fillScreens);
    this.dust.tintTowardSand(TUNING.dustTint);
    this.bank = densityBatch(shapes, capacity.bank, fillScreens);
    this.fire = densityBatch(shapes, capacity.fire, fillScreens);
    this.fire.fadeDensityRim(FIRE_RIM);
    const dustPass = new DensityPass([this.dust]);
    const bankPass = new DensityPass([this.bank]);
    const firePass = new DensityPass([this.fire]);
    this.passes = [dustPass, bankPass, firePass];
    this.uniforms.dust.value = dustPass.target.texture;
    this.uniforms.bank.value = bankPass.target.texture;
    this.uniforms.fire.value = firePass.target.texture;
    this.quad.frustumCulled = false;
    const depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedInt248Type);
    depthTexture.format = THREE.DepthStencilFormat;
    this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, { samples: SCENE_SAMPLES, type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace, depthBuffer: true, stencilBuffer: true, depthTexture });
    this.uniforms.sceneColor.value = this.sceneTarget.texture;
  }

  light(l: CardLight): void {
    this.sunWorld.copy(l.sunDir);
    this.uniforms.sunColor.value.copy(l.sun);
    this.uniforms.skyColor.value.copy(l.sky);
    this.uniforms.groundColor.value.copy(l.ground);
  }

  holds(): boolean {
    return this.passes.some((p) => p.holds());
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera, drawScene: () => void): void {
    if (!(camera instanceof THREE.OrthographicCamera)) throw new Error('The ink layer reads depth from an orthographic camera');
    const into = renderer.getRenderTarget();
    this.fit(renderer, into);
    renderer.setRenderTarget(this.sceneTarget);
    drawScene();
    const depth = this.sceneTarget.depthTexture;
    if (!depth) throw new Error('The ink layer scene target lost its depth texture');
    for (const p of this.passes) p.draw(renderer, camera, depth, this.densitySize);
    this.uniforms.sunView.value.copy(this.sunWorld).transformDirection(camera.matrixWorldInverse);
    this.uniforms.uvPerMeter.value.set(camera.zoom / (camera.right - camera.left), camera.zoom / (camera.top - camera.bottom));
    renderer.setRenderTarget(into);
    renderer.render(this.quad, this.quadCamera);
  }

  private fit(renderer: THREE.WebGLRenderer, into: THREE.WebGLRenderTarget | null): void {
    if (into) this.size.set(into.width, into.height);
    else renderer.getDrawingBufferSize(this.size);
    if (this.sceneTarget.width !== this.size.x || this.sceneTarget.height !== this.size.y) this.sceneTarget.setSize(this.size.x, this.size.y);
    this.densitySize.set(Math.max(1, Math.round(this.size.x * DENSITY_SCALE)), Math.max(1, Math.round(this.size.y * DENSITY_SCALE)));
    for (const p of this.passes) p.fit(this.densitySize);
  }
}
