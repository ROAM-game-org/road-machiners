import * as THREE from 'three';
import { HAZE_WAVE_WEIGHT, hazeWavesGlsl } from './hazeWaves';
import { frameTarget } from './frameTarget';
import { PULSE_WAVE, type PulseWave } from './pulse';

export type WaveFrame = {
  first: THREE.Vector4;
  second: THREE.Vector4;
  groundPerUv: THREE.Vector4;
  uvPerGround: THREE.Vector4;
  clockS: number;
};

const NO_WAVE = new THREE.Vector4(0, 0, 0, 0);

export function waveFrame(waves: readonly PulseWave[], camera: THREE.OrthographicCamera): WaveFrame | null {
  const live = waves.filter((w) => w.strength > 0).sort((a, b) => b.strength - a.strength).slice(0, 2);
  if (live.length === 0) return null;
  camera.updateMatrixWorld();
  const groundPerUv = groundPerUvOf(camera);
  const packed = live.map((w) => {
    const uv = w.at instanceof THREE.Vector3 ? w.at.clone() : new THREE.Vector3(w.at.x, w.at.y, w.at.z);
    uv.project(camera);
    return new THREE.Vector4(uv.x * 0.5 + 0.5, uv.y * 0.5 + 0.5, w.radiusM, w.strength);
  });
  return { first: packed[0], second: packed[1] ?? NO_WAVE, groundPerUv, uvPerGround: inverseOf(groundPerUv), clockS: live[0].clockS };
}

function groundPerUvOf(camera: THREE.OrthographicCamera): THREE.Vector4 {
  const view = camera.getWorldDirection(new THREE.Vector3());
  if (Math.abs(view.y) < 1e-3) throw new Error('The pulse wave needs a camera that looks down at the ground');
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const onGround = (e: THREE.Vector3) => e.clone().addScaledVector(view, -e.y / view.y);
  const across = onGround(right.multiplyScalar((camera.right - camera.left) / camera.zoom));
  const rising = onGround(up.multiplyScalar((camera.top - camera.bottom) / camera.zoom));
  return new THREE.Vector4(across.x, across.z, rising.x, rising.z);
}

function inverseOf(m: THREE.Vector4): THREE.Vector4 {
  const det = m.x * m.w - m.z * m.y;
  if (Math.abs(det) < 1e-9) throw new Error('The pulse wave camera maps the screen onto a line');
  return new THREE.Vector4(m.w / det, -m.y / det, -m.z / det, m.x / det);
}

const VERTEX = `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAGMENT = `uniform sampler2D waveScene;
uniform vec4 waveA;
uniform vec4 waveB;
uniform float waveTime;
uniform vec4 groundPerUv;
uniform vec4 uvPerGround;
varying vec2 vUv;

vec2 pushOf(vec4 wave) {
  if (wave.w <= 0.0) return vec2(0.0);
  vec2 g = mat2(groundPerUv.xy, groundPerUv.zw) * (vUv - wave.xy);
  float r = length(g);
  vec2 dir = g / max(r, 0.001);
  vec2 hazeP = g;
  vec2 lobe = vec2(0.0);
${hazeWavesGlsl({ point: 'hazeP', time: 'waveTime', warp: 'hazeWarp', out: 'lobe' })}
  lobe /= ${HAZE_WAVE_WEIGHT.toFixed(4)};
  float strength = wave.w * (1.0 + ${PULSE_WAVE.lobeShare.toFixed(4)} * lobe.x);
  float x = clamp((r - wave.z + ${PULSE_WAVE.lobeM.toFixed(4)} * lobe.y) / ${PULSE_WAVE.frontM.toFixed(4)}, -1.0, 1.0);
  vec2 push = -dir * ${PULSE_WAVE.pushM.toFixed(4)} * strength * sin(3.1415927 * x);
  float back = wave.z - ${PULSE_WAVE.frontM.toFixed(4)} - r;
  float trail = smoothstep(0.0, ${(PULSE_WAVE.frontM * 0.5).toFixed(4)}, back) * (1.0 - smoothstep(0.0, ${(PULSE_WAVE.frontM * PULSE_WAVE.trailFronts).toFixed(4)}, back));
  push += lobe * ${(PULSE_WAVE.pushM * PULSE_WAVE.trailShare).toFixed(4)} * strength * trail;
  return push;
}

void main() {
  vec2 ground = pushOf(waveA) + pushOf(waveB);
  vec2 uv = clamp(vUv + mat2(uvPerGround.xy, uvPerGround.zw) * ground, 0.0, 1.0);
  gl_FragColor = texture2D(waveScene, uv);
  #include <colorspace_fragment>
}`;

export class PulseWavePass {
  private readonly target = frameTarget({ depthRead: false });
  private readonly material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { waveScene: { value: this.target.texture }, waveA: { value: new THREE.Vector4() }, waveB: { value: new THREE.Vector4() }, waveTime: { value: 0 }, groundPerUv: { value: new THREE.Vector4() }, uvPerGround: { value: new THREE.Vector4() } },
    depthTest: false,
    depthWrite: false,
  });
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly size = new THREE.Vector2();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.quad.frustumCulled = false;
  }

  render(frame: WaveFrame, drawInner: () => void): void {
    const into = this.renderer.getRenderTarget();
    this.renderer.getDrawingBufferSize(this.size);
    if (this.target.width !== this.size.x || this.target.height !== this.size.y) this.target.setSize(this.size.x, this.size.y);
    const u = this.material.uniforms;
    u.waveA.value.copy(frame.first);
    u.waveB.value.copy(frame.second);
    u.waveTime.value = frame.clockS;
    u.groundPerUv.value.copy(frame.groundPerUv);
    u.uvPerGround.value.copy(frame.uvPerGround);
    this.renderer.setRenderTarget(this.target);
    drawInner();
    this.renderer.setRenderTarget(into);
    this.renderer.render(this.quad, this.camera);
  }
}
