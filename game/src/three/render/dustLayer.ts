import * as THREE from 'three';
import { TUNING } from './inkTuning';
import { INK_SHADE } from './particles/cardShaders';
import { CardBatch, type CardLight } from './particles/cards';

const SCENE_SAMPLES = 4;
const DENSITY_SCALE = 0.5;
const MASS = { thickAt: 2, sand: [0.85, 0.66, 0.42], litSky: 0.6 };
const LIGHT = { steps: 3, up: 0.6, under: { from: 0.2, to: 0.8 } };
const BILLOW_FALL_FROM = 0.3;
const ACCENT = { strength: 1.3, probeMeters: 0.2, facing: 0.15, bendMeters: 0.25 };
const STREAKS = { first: 1.7, blurMeters: 0.25, thick: { meters: 0.6, from: 1.0, to: 1.3 }, bend: { from: -0.06, to: 0.04 } };
const KNOB_UNIFORMS = ["dustEdge", "dustThin", "dustThick", "dustTint", "dustShade", "dustShadeReach", "dustBands", "dustBandStep", "dustBandShade", "dustLines", "dustStreaks", "dustStreakPx", "dustStreakDark"] as const;

const f = (n: number) => n.toFixed(3);

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAGMENT = `
uniform sampler2D sceneColor;
uniform sampler2D dust;
uniform vec2 uvPerMeter;
uniform vec3 sunView;
uniform vec3 sunColor;
uniform vec3 skyColor;
uniform vec3 groundColor;
${KNOB_UNIFORMS.map((key) => `uniform float ${key};`).join("\n")}
varying vec2 vUv;
${INK_SHADE}
float densityAt(vec2 meters) {
  return texture2D(dust, vUv + meters * uvPerMeter).a;
}
float outside(vec2 meters) {
  return 1.0 - smoothstep(dustEdge * 0.6, dustEdge * 1.2, densityAt(meters));
}
float billowLevel(float a) {
  return log(max(a, 0.0001) / dustEdge) / log(dustBandStep);
}
float facesSun(vec2 toSun, float a) {
  return smoothstep(0.0, ${f(ACCENT.facing)}, (a - densityAt(toSun * ${f(ACCENT.probeMeters)})) / max(a, 0.0001));
}
float billowLine(float u, float keep) {
  float du = fwidth(u);
  float half_ = dustStreakPx * 0.5 * keep;
  return 1.0 - smoothstep(du * half_, du * (half_ + 1.0), abs(u - floor(u + 0.5)));
}
float convexity(float a) {
  float r = ${f(ACCENT.bendMeters)};
  float e = densityAt(vec2(r, 0.0));
  float w = densityAt(vec2(-r, 0.0));
  float n = densityAt(vec2(0.0, r));
  float s = densityAt(vec2(0.0, -r));
  float gx = (e - w) * 0.5;
  float gy = (n - s) * 0.5;
  float gxx = e + w - 2.0 * a;
  float gyy = n + s - 2.0 * a;
  float gxy = (densityAt(vec2(r, r)) - densityAt(vec2(r, -r)) - densityAt(vec2(-r, r)) + densityAt(vec2(-r, -r))) * 0.25;
  float g2 = gx * gx + gy * gy;
  return -(gxx * gy * gy - 2.0 * gxy * gx * gy + gyy * gx * gx) / max(pow(g2, 1.5), 0.00001);
}
vec2 lightDir() {
  float across = smoothstep(0.02, 0.2, length(sunView.xy));
  vec2 flatSun = sunView.xy / max(length(sunView.xy), 0.0001) * across;
  return normalize(vec2(0.0, ${f(LIGHT.up)}) + flatSun);
}
void main() {
  vec4 scene = texture2D(sceneColor, vUv);
  vec4 here = texture2D(dust, vUv);
  float a = here.a;
  float aa = fwidth(a) * 0.75 + 0.0001;
  float cover = smoothstep(dustEdge - aa, dustEdge + aa, a);
  gl_FragColor = scene;
  if (cover > 0.0) {
    vec2 toSun = lightDir();
    float under = 0.0;
    for (int i = 1; i <= ${LIGHT.steps}; i++) under += outside(-toSun * dustShadeReach * float(i));
    under /= ${LIGHT.steps}.0;
    vec3 sand = mix(here.rgb / max(a, 0.0001), vec3(${MASS.sand.map(f).join(', ')}), dustTint);
    vec3 sunlit = sand * (sunColor + mix(groundColor, skyColor, 0.75) * ${f(MASS.litSky)}) * ${(1 / Math.PI).toFixed(6)};
    vec3 shaded = mix(sunlit, inkShade(sunlit), dustShade);
    float u = min(billowLevel(a), dustBands);
    float lowerPart = smoothstep(${f(BILLOW_FALL_FROM)}, 1.0, fract(max(u, 0.0))) * dustBandShade * step(u, dustBands - 0.001);
    float shade = max(smoothstep(${f(LIGHT.under.from)}, ${f(LIGHT.under.to)}, under), lowerPart);
    vec3 color = mix(sunlit, shaded, shade);
    float opacity = mix(dustThin, dustThick, smoothstep(dustEdge, dustEdge * ${f(MASS.thickAt)}, a));
    vec3 painted = mix(scene.rgb, color, cover * opacity);
    float b = ${f(STREAKS.blurMeters)};
    float smooth_ = (a + densityAt(vec2(b, 0.0)) + densityAt(vec2(-b, 0.0)) + densityAt(vec2(0.0, b)) + densityAt(vec2(0.0, -b))) / 5.0;
    float streakU = log(max(smooth_, 0.0001) / (dustEdge * ${f(STREAKS.first)})) / log(dustBandStep);
    float inside = step(-0.5, streakU) * step(streakU, dustStreaks - 0.5);
    float thick = smoothstep(smooth_ * ${f(STREAKS.thick.from)}, smooth_ * ${f(STREAKS.thick.to)}, densityAt(-toSun * ${f(STREAKS.thick.meters)}));
    float keep = smoothstep(${f(STREAKS.bend.from)}, ${f(STREAKS.bend.to)}, convexity(smooth_)) * facesSun(toSun, smooth_) * thick;
    float ink = clamp(billowLine(streakU, keep) * keep * inside * dustLines * ${f(ACCENT.strength)}, 0.0, 1.0);
    gl_FragColor = vec4(mix(painted, shaded * (1.0 - dustStreakDark), ink), 1.0);
  }
  #include <colorspace_fragment>
}`;

export class DustLayer {
  readonly batch: CardBatch;
  private readonly dustScene = new THREE.Scene();
  private readonly sceneTarget: THREE.WebGLRenderTarget;
  private readonly densityTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  private readonly uniforms = {
    sceneColor: { value: null as THREE.Texture | null },
    dust: { value: this.densityTarget.texture as THREE.Texture },
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
  private readonly clearColor = new THREE.Color();

  constructor(shapes: THREE.Texture, capacity: number, fillScreens: number) {
    this.batch = new CardBatch(capacity, 'density', shapes, fillScreens / (DENSITY_SCALE * DENSITY_SCALE));
    this.dustScene.add(this.batch.mesh);
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
    return this.batch.drawn() > 0;
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera, drawScene: () => void): void {
    if (!(camera instanceof THREE.OrthographicCamera)) throw new Error('The dust layer reads depth from an orthographic camera');
    const into = renderer.getRenderTarget();
    this.fit(renderer, into);
    renderer.setRenderTarget(this.sceneTarget);
    drawScene();
    this.drawDensity(renderer, camera);
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
    if (this.densityTarget.width !== this.densitySize.x || this.densityTarget.height !== this.densitySize.y) this.densityTarget.setSize(this.densitySize.x, this.densitySize.y);
  }

  private drawDensity(renderer: THREE.WebGLRenderer, camera: THREE.OrthographicCamera): void {
    if (!this.sceneTarget.depthTexture) throw new Error('The dust layer scene target lost its depth texture');
    this.batch.readDepth(this.sceneTarget.depthTexture, this.densitySize, camera);
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    renderer.setRenderTarget(this.densityTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.dustScene, camera);
    renderer.autoClear = autoClear;
    renderer.setClearColor(this.clearColor, alpha);
  }
}
