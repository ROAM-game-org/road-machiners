import * as THREE from "three";
import { TUNING } from "./inkTuning";

const CRT_SAMPLES = 4;
const CRT_SCENE_DENSITY = 1.5;
const CRT_LINE_PX = 3;
const CRT_SCAN_DEPTH = 0.32;
const CRT_MASK = 0.14;
const CRT_FRINGE = 0.012;
const CRT_SPLIT_PX = 0.8;
const CRT_GLOW_REACH_PX = 4;
const CRT_GLOW = 0.45;
const CRT_SATURATION = 1.18;
const CRT_VIGNETTE = 0.22;

const VERTEX = `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAGMENT = `uniform sampler2D crtScene;
uniform vec2 crtSize;
uniform float crtScale;
uniform float crtStrength;
varying vec2 vUv;

vec3 crtGlow(vec2 uv, vec2 reach) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float turn = float(i) * 0.7853982;
    sum += texture2D(crtScene, uv + vec2(cos(turn), sin(turn)) * reach).rgb;
  }
  return sum / 8.0;
}

void main() {
  vec2 centered = vUv - 0.5;
  vec2 pixel = crtScale / crtSize;
  vec2 shift = (centered * dot(centered, centered) * ${CRT_FRINGE} + vec2(pixel.x * ${CRT_SPLIT_PX}, 0.0)) * crtStrength;
  vec3 color = vec3(texture2D(crtScene, vUv + shift).r, texture2D(crtScene, vUv).g, texture2D(crtScene, vUv - shift).b);
  color += crtGlow(vUv, pixel * ${CRT_GLOW_REACH_PX.toFixed(1)}) * ${CRT_GLOW} * crtStrength;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec3 shown = gl_FragColor.rgb;
  shown = max(mix(vec3(dot(shown, vec3(0.2126, 0.7152, 0.0722))), shown, 1.0 + (${CRT_SATURATION} - 1.0) * crtStrength), 0.0);
  float row = gl_FragCoord.y / (crtScale * ${CRT_LINE_PX.toFixed(1)});
  float scanDepth = ${CRT_SCAN_DEPTH} * crtStrength;
  float scan = 1.0 - scanDepth * (0.5 + 0.5 * cos(row * 6.2831853));
  int column = int(mod(floor(gl_FragCoord.x / crtScale), 3.0));
  float maskDepth = ${CRT_MASK} * crtStrength;
  vec3 mask = vec3(1.0 - maskDepth);
  if (column == 0) mask.r = 1.0;
  else if (column == 1) mask.g = 1.0;
  else mask.b = 1.0;
  float vignette = pow(16.0 * vUv.x * vUv.y * (1.0 - vUv.x) * (1.0 - vUv.y), ${CRT_VIGNETTE} * crtStrength);
  float keep = 1.0 / ((1.0 - scanDepth * 0.5) * (1.0 - maskDepth * 0.667));
  gl_FragColor = vec4(shown * scan * mask * vignette * keep, 1.0);
}`;

export class CrtPass {
  private readonly target = new THREE.WebGLRenderTarget(1, 1, { samples: CRT_SAMPLES, type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace, stencilBuffer: true, depthBuffer: true, resolveDepthBuffer: false, resolveStencilBuffer: false });
  private readonly material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: { crtScene: { value: this.target.texture }, crtSize: { value: new THREE.Vector2(1, 1) }, crtScale: { value: 1 }, crtStrength: TUNING.crt }, depthTest: false, depthWrite: false });
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly size = new THREE.Vector2();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.quad.frustumCulled = false;
  }

  render(drawScene: () => void): void {
    this.renderer.getDrawingBufferSize(this.size);
    const share = Math.min(1, CRT_SCENE_DENSITY / this.renderer.getPixelRatio());
    const width = Math.round(this.size.x * share);
    const height = Math.round(this.size.y * share);
    if (this.target.width !== width || this.target.height !== height) this.target.setSize(width, height);
    this.material.uniforms.crtSize.value.copy(this.size);
    this.material.uniforms.crtScale.value = this.renderer.getPixelRatio();
    this.renderer.setRenderTarget(this.target);
    drawScene();
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quad, this.camera);
  }
}
