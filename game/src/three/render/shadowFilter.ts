import * as THREE from "three";

const NOISY_TAPS = /float phi = interleavedGradientNoise\( gl_FragCoord\.xy \) \* PI2;[\s\S]*?\) \* 0\.2;/;

const GRID_TAPS = `float sum = 0.0;
				for ( int sx = -1; sx <= 1; sx ++ ) {
					for ( int sy = -1; sy <= 1; sy ++ ) {
						sum += texture( shadowMap, vec3( shadowCoord.xy + vec2( float( sx ), float( sy ) ) * radius, shadowCoord.z ) );
					}
				}
				shadow = sum / 9.0;`;

export function installShadowFilter(): void {
  const chunk: string = THREE.ShaderChunk.shadowmap_pars_fragment;
  if (chunk.includes(GRID_TAPS)) return;
  const end = chunk.indexOf("float getPointShadow");
  const head = end < 0 ? chunk : chunk.slice(0, end);
  if (!NOISY_TAPS.test(head)) throw new Error("Shadow filter patch: three's 2D PCF block was not found");
  THREE.ShaderChunk.shadowmap_pars_fragment = head.replace(NOISY_TAPS, () => GRID_TAPS) + chunk.slice(head.length);
}

function skipDarkInLoop(chunk: string, kind: "point" | "spot"): string {
  const open = `${kind}Light = ${kind}Lights[ i ];`;
  const start = chunk.indexOf(open);
  const direct = start < 0 ? -1 : chunk.indexOf("RE_Direct(", start);
  const end = direct < 0 ? -1 : chunk.indexOf(";", direct);
  if (end < 0) throw new Error(`Dark light patch: three's ${kind} light loop was not found`);
  const body = chunk.slice(start, end + 1);
  return `${chunk.slice(0, start)}if ( ${kind}Lights[ i ].color != vec3( 0.0 ) ) {\n${body}\n}${chunk.slice(end + 1)}`;
}

export function installDarkLightSkip(): void {
  const chunk: string = THREE.ShaderChunk.lights_fragment_begin;
  if (chunk.includes("Lights[ i ].color != vec3( 0.0 )")) return;
  THREE.ShaderChunk.lights_fragment_begin = skipDarkInLoop(skipDarkInLoop(chunk, "point"), "spot");
}

export function enableSunShadows(renderer: THREE.WebGLRenderer): void {
  installShadowFilter();
  installDarkLightSkip();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
}
