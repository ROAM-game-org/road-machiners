import * as THREE from "three";
import { SIN_ELEVATION } from "./camera";
import type { GroundFormUniforms } from "./groundForm";
import { TUNING } from "./inkTuning";

export const HILL_RANGE_METERS = 2;
const HILL_TEXELS_PER_TILE = 2;
const HILL_BIAS_METERS = 0.1;
const HILL_FIRST_STEP_METERS = 1;
const HILL_STEP_GROWTH = 1.09;
const HILL_STEPS = 64;
const HILL_MAX_REACH_METERS = 200;
const HILL_BANDS = 4;
const SUN_DIGITS = 4;
const WINDOW_MARGIN = 1.5;

export type HillUniforms = {
  groundHillShadows: { value: number };
  groundHill: { value: THREE.Texture };
  groundHillReady: { value: number };
  groundHillUv: { value: THREE.Vector2 };
  groundHillSide: { value: number };
};

export class HillShadows {
  readonly uniforms: HillUniforms;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly toSun = new THREE.Vector3();
  private readonly texelMeters: number;
  private drawn = "";
  private moving = "";
  private band = 0;

  constructor(private readonly form: GroundFormUniforms, cornersPerSide: number) {
    this.texelMeters = form.groundFormTileMeters.value / HILL_TEXELS_PER_TILE;
    const side = (cornersPerSide - 1) * HILL_TEXELS_PER_TILE + 1;
    this.target = new THREE.WebGLRenderTarget(side, side, { format: THREE.RedFormat, depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.uniforms = {
      groundHillShadows: TUNING.hillShadows,
      groundHill: { value: this.target.texture },
      groundHillReady: { value: 0 },
      groundHillUv: { value: new THREE.Vector2(1 / (this.texelMeters * side), 0.5 / side) },
      groundHillSide: { value: side },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: { groundForm: form.groundForm, groundFormUv: form.groundFormUv, groundFormTileMeters: form.groundFormTileMeters, groundFormRelief: form.groundFormRelief, hillTexelMeters: { value: this.texelMeters }, hillToSun: { value: this.toSun } },
      vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: HILL_TRACE,
      depthTest: false,
      depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  }

  follow(renderer: THREE.WebGLRenderer, sun: THREE.DirectionalLight, camera: THREE.OrthographicCamera): void {
    this.toSun.copy(sun.position).sub(sun.target.position).normalize();
    const key = `${this.toSun.toArray().map((v) => v.toFixed(SUN_DIGITS)).join(",")}|${this.form.groundForm.value.id}`;
    if (key !== this.moving) {
      const first = this.moving === "";
      this.moving = key;
      this.band = 0;
      if (first) return this.drawWhole(renderer, key);
      return this.draw(renderer, this.around(sun.target.position, Math.hypot(camera.right, camera.top / SIN_ELEVATION)));
    }
    if (key === this.drawn) return;
    const side = this.target.width;
    const from = Math.floor((side * this.band) / HILL_BANDS);
    const to = Math.floor((side * (this.band + 1)) / HILL_BANDS);
    this.draw(renderer, new THREE.Vector4(0, from, side, to - from));
    this.band++;
    if (this.band === HILL_BANDS) this.drawn = key;
  }

  forget(): void {
    this.drawn = "";
    this.moving = "";
  }

  private drawWhole(renderer: THREE.WebGLRenderer, key: string): void {
    this.draw(renderer, null);
    this.drawn = key;
    this.uniforms.groundHillReady.value = 1;
  }

  private around(focus: { x: number; z: number }, reachMeters: number): THREE.Vector4 {
    const reach = Math.ceil((reachMeters * WINDOW_MARGIN) / this.texelMeters);
    const side = this.target.width;
    const x = Math.max(0, Math.floor(focus.x / this.texelMeters) - reach);
    const y = Math.max(0, Math.floor(focus.z / this.texelMeters) - reach);
    return new THREE.Vector4(x, y, Math.min(side, x + 2 * reach) - x, Math.min(side, y + 2 * reach) - y);
  }

  private draw(renderer: THREE.WebGLRenderer, window: THREE.Vector4 | null): void {
    const into = renderer.getRenderTarget();
    this.target.scissorTest = window !== null;
    if (window) this.target.scissor.copy(window);
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(into);
  }
}

const HILL_TRACE = `
uniform sampler2D groundForm;
uniform vec2 groundFormUv;
uniform float groundFormTileMeters;
uniform float groundFormRelief;
uniform float hillTexelMeters;
uniform vec3 hillToSun;
float heightAt(vec2 at) {
  return texture2D(groundForm, at * groundFormUv.x + groundFormUv.y).r * groundFormTileMeters;
}
void main() {
  float across = length(hillToSun.xz);
  float over = -${HILL_RANGE_METERS.toFixed(1)};
  if (hillToSun.y > 0.0 && across > 1e-4) {
    vec2 at = (gl_FragCoord.xy - 0.5) * hillTexelMeters;
    vec2 way = hillToSun.xz / across;
    float climb = hillToSun.y / across;
    float start = heightAt(at) + ${HILL_BIAS_METERS.toFixed(2)};
    float reach = min(${HILL_MAX_REACH_METERS.toFixed(1)}, groundFormRelief / climb);
    float along = ${HILL_FIRST_STEP_METERS.toFixed(1)};
    for (int i = 0; i < ${HILL_STEPS}; i++) {
      if (along > reach || over > ${HILL_RANGE_METERS.toFixed(1)}) break;
      over = max(over, heightAt(at + way * along) - start - along * climb);
      along *= ${HILL_STEP_GROWTH.toFixed(2)};
    }
  }
  gl_FragColor = vec4(clamp(over / ${HILL_RANGE_METERS.toFixed(1)} * 0.5 + 0.5, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;
