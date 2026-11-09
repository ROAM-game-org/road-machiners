import * as THREE from "three";
import type { Daylight } from "./daylight";
import { TUNING } from "./inkTuning";
import { injectAfter, injectBefore, replaceChunk } from "./shaderPatch";

const OWNER = "The ink paint";
const INK_RISE_FULL_METERS = 3;
const INK_STROKE_LENGTH = 1.8;
const INK_BAND_SLOPE_FROM = 0.1;
const INK_BAND_SLOPE_FULL = 0.16;
const INK_BAND_SOFT = 0.35;

export const INK_CONTRACT = `
struct InkSurface { float road; float edge; float height; vec2 slope; float rise; vec2 form; };
InkSurface inkSurface = InkSurface(0.0, 0.0, 0.0, vec2(0.0), 0.0, vec2(0.0));
struct InkSun { float anyCast; float litCast; float facing; vec3 dirView; };
InkSun inkSun = InkSun(0.0, 0.0, 0.0, vec3(0.0, 1.0, 0.0));
vec3 inkLamp = vec3(0.0);
vec3 inkGlow = vec3(0.0);
`;

const INK_COLOR = `
varying vec3 vInkAt;
uniform float inkFullLight;
uniform float inkDayLight;
uniform float inkColor;
uniform float inkShadeLine;
uniform float inkHatch;
uniform float inkHatchPx;
uniform float inkContour;
uniform float inkContourStep;
uniform float inkContourSoft;
uniform float inkContourOpacity;
uniform float inkContourCross;
uniform float inkObjectHatch;
uniform float inkRelief;
uniform float inkShadeDark;
uniform float inkShadeShift;
uniform float inkCastDark;
uniform float inkHeightTint;
const vec3 INK_BLACK = vec3(0.08, 0.07, 0.1);
float inkHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float inkNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(inkHash(cell), inkHash(cell + vec2(1.0, 0.0)), f.x), mix(inkHash(cell + vec2(0.0, 1.0)), inkHash(cell + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 inkFit(vec3 v) { return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081); }
vec3 inkToScreen(vec3 linear) {
  vec3 color = linear * 1.05 / 0.6;
  color = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777)) * color;
  color = inkFit(color);
  color = clamp(mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602)) * color, 0.0, 1.0);
  return mix(color * 12.92, 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, color));
}
vec3 inkFromScreen(vec3 shown) {
  vec3 color = clamp(shown, 0.0, 1.0);
  return mix(color / 12.92, pow((color + 0.055) / 1.055, vec3(2.4)), step(0.04045, color));
}
vec3 inkSunlit(vec3 linear, vec3 albedo) { return linear / max(albedo, vec3(0.001)); }
float inkLevel(vec3 lit) { return dot(lit, vec3(0.2126, 0.7152, 0.0722)) / inkFullLight; }
vec3 inkAtLevel(vec3 albedo, vec3 lit, float level, float wanted) { return albedo * lit * wanted / max(level, 0.05); }
float inkLuma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float inkStrokes(vec2 p, vec2 dir, vec2 pDx, vec2 pDy, float spacing, float width, float longest, float kept, float seed) {
  float along = dot(p, dir) / spacing + (inkNoise(p / 5.0 + seed) - 0.5) * 0.3;
  float row = floor(along);
  float v = dot(p, vec2(-dir.y, dir.x)) / longest + inkHash(vec2(row, seed)) * 9.0;
  float aa = (abs(dot(pDx, dir)) + abs(dot(pDy, dir))) / spacing;
  float line = 1.0 - smoothstep(width - aa, width + aa, abs(fract(along) - 0.5));
  return line * step(inkHash(vec2(floor(v), row + seed)), kept) * (1.0 - smoothstep(0.4, 0.9, aa));
}
float inkScreenPx() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  return max(max(fwidth(dot(vInkAt, right)), fwidth(dot(vInkAt, up))), 0.00001);
}
float inkStrokesAt(vec2 plane, vec2 planeDx, vec2 planeDy, float spacing) {
  return inkStrokes(plane, vec2(0.7071, -0.7071), planeDx, planeDy, spacing, 0.14, spacing * ${INK_STROKE_LENGTH.toFixed(1)}, 0.6, 8.0);
}
float inkShadeStrokes(vec2 plane, vec2 planeDx, vec2 planeDy, float screenPx) {
  float octave = log2(inkHatchPx * screenPx);
  float level = floor(octave);
  float spacing = exp2(level);
  return mix(inkStrokesAt(plane, planeDx, planeDy, spacing), inkStrokesAt(plane, planeDx, planeDy, spacing * 2.0), smoothstep(0.0, 1.0, octave - level));
}
float inkInShade(float sunShade) {
  float shadeAa = fwidth(sunShade) + 0.004;
  return smoothstep(0.5 - shadeAa, 0.5 + shadeAa, sunShade);
}
float inkDim() {
  return min(1.0, inkLuma(inkToScreen(vec3(inkFullLight))) / inkLuma(inkToScreen(vec3(inkDayLight))));
}
float inkSmoothRelief(float level) {
  return clamp(0.55 + 0.5 * level, 0.7, 1.15);
}
vec3 inkBase(vec3 albedo, vec3 lit, float level, float inShade, float relief) {
  vec3 flat_ = inkToScreen(inkAtLevel(albedo, lit, level, 1.0) + inkLamp);
  vec3 pastel = mix(flat_, vec3(0.98, 0.95, 0.86) * inkDim(), 0.32);
  pastel = mix(pastel, pastel * vec3(0.66, 0.68, 0.84), inShade);
  vec3 vivid = max(mix(vec3(inkLuma(flat_)), flat_, 1.3), 0.0);
  vivid = mix(vivid, vivid * vec3(0.5, 0.5, 0.66), inShade);
  vec3 color = max(mix(pastel, vivid, inkColor), 0.0) * mix(1.0, relief, inkRelief);
  if (max(inkGlow.r, max(inkGlow.g, inkGlow.b)) <= 0.0) return color;
  return color + (1.0 - min(color, 1.0)) * inkToScreen(inkGlow);
}
vec3 inkFinish(vec3 color, vec2 plane, float lineShade, float inShade, float hatchShare, float contour) {
  float screenPx = inkScreenPx();
  vec2 planeDx = dFdx(plane);
  vec2 planeDy = dFdy(plane);
  float shadeMarks = 0.0;
  if (inShade > 0.0 && hatchShare > 0.0) shadeMarks = inkShadeStrokes(plane, planeDx, planeDy, screenPx) * inShade;
  color = mix(color, color * 0.55, shadeMarks * hatchShare);
  float shadeLine = 1.0 - smoothstep(0.6, 1.3, abs(lineShade - 0.5) / max(fwidth(lineShade), 0.0006));
  color = mix(color, INK_BLACK, max(max(shadeLine * inkShadeLine, inkSurface.edge), contour));
  return inkFromScreen(color);
}
`;

const INK_GROUND = `${INK_CONTRACT}${INK_COLOR}
const vec3 INK_SHADE_COOL = vec3(0.82, 0.88, 1.15);
uniform float inkShadeCut;
uniform float inkLitFace;
const vec3 INK_SUN_FACE = vec3(1.35, 1.18, 0.95);
float inkContourLine(float interval) {
  float height = inkSurface.height;
  float px = max(length(fwidth(vInkAt.xz)), 0.0005);
  vec2 grad = inkSurface.slope;
  float slope = length(grad);
  float across = (height - floor(height / interval + 0.5) * interval) / max(slope, 0.002);
  float solid = 1.0 - smoothstep(px * 0.5, px * 1.3, abs(across));
  float spacing = max(0.9, px * 16.0);
  float side = abs(grad.x) > abs(grad.y) ? vInkAt.z : vInkAt.x;
  float w = across / (spacing * 0.9);
  float slant = fract(side / spacing - w * 0.7 + 0.5) - 0.5;
  float cross_ = fract(side / spacing + w * 0.7 + 0.5) - 0.5;
  float reach = inkContourCross > 0.5 ? min(abs(slant), abs(cross_)) : abs(slant);
  float thread = max(0.05, px * 1.1) / spacing;
  float stroked = (1.0 - smoothstep(thread, thread + px / spacing, reach)) * (1.0 - smoothstep(0.42, 0.5, abs(w)));
  float line = mix(solid, stroked, inkContourSoft);
  return line * smoothstep(0.004, 0.02, slope) * inkContourOpacity;
}
vec3 inkHeightBands(vec3 color) {
  float bandAt = inkSurface.height / inkContourStep;
  float bandAa = clamp(fwidth(bandAt), 0.0001, 1.0);
  float band = floor(bandAt) + smoothstep(1.0 - max(bandAa, ${INK_BAND_SOFT.toFixed(2)}), 1.0, fract(bandAt));
  float bandRise = band * inkContourStep - (inkSurface.height - inkSurface.rise);
  float high = clamp(0.5 + bandRise / ${(2 * INK_RISE_FULL_METERS).toFixed(1)}, 0.0, 1.0);
  float heightTint = inkHeightTint * (1.0 - inkSurface.road) * smoothstep(${INK_BAND_SLOPE_FROM.toFixed(3)}, ${INK_BAND_SLOPE_FULL.toFixed(3)}, length(inkSurface.slope));
  color *= mix(1.0, mix(0.93, 1.05, high), heightTint);
  return mix(color, color * vec3(0.95, 0.97, 1.03), (1.0 - high) * heightTint * 0.5);
}
float inkFacing(vec2 slope) {
  vec3 up = normalize((viewMatrix * vec4(-slope.x, 1.0, -slope.y, 0.0)).xyz);
  vec3 flatUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  return dot(up, inkSun.dirView) / max(dot(flatUp, inkSun.dirView), 0.05);
}
vec3 inkGroundShade(vec3 color, float inShade) {
  vec3 tinted = color * INK_SHADE_COOL;
  vec3 cool = tinted * inkLuma(color) / max(inkLuma(tinted), 0.0001);
  return mix(color, cool, inkShadeShift * inShade) * (1.0 - inkShadeDark * inShade);
}
float inkTurnedAway() {
  vec3 sun = (vec4(inkSun.dirView, 0.0) * viewMatrix).xyz;
  float sunAcross = length(sun.xz);
  float away = dot(inkSurface.form, sun.xz / max(sunAcross, 0.01));
  float aa = 0.5 * fwidth(away) + 0.0001;
  float cut = tan(radians(inkShadeCut));
  return smoothstep(cut - aa, cut + aa, away) * step(0.0001, inkShadeCut) * smoothstep(0.0, 0.05, sun.y) * smoothstep(0.01, 0.05, sunAcross);
}
vec3 inkSunFace(vec3 color, float inShade) {
  float toward = clamp(inkFacing(inkSurface.slope) - 1.0, 0.0, 1.0);
  return color * mix(vec3(1.0), INK_SUN_FACE, inkLitFace * toward * (1.0 - inShade));
}
vec3 inkPaint(vec3 linear, vec3 albedo) {
  vec3 lit = inkSunlit(linear, albedo);
  float level = inkLevel(lit);
  float sunless = 1.0 - (1.0 - inkSun.anyCast) * (1.0 - max(inkSun.facing, inkTurnedAway()));
  float inShade = inkInShade(sunless);
  float relief = mix(inkSmoothRelief(inkFacing(inkSurface.slope)), inkSmoothRelief(1.0), inShade);
  vec3 color = inkGroundShade(inkSunFace(inkHeightBands(inkBase(albedo, lit, level, 0.0, relief)), inShade), inShade);
  color *= 1.0 - inkCastDark * inShade;
  vec3 screenRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 screenUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec2 plane = vec2(dot(vInkAt, screenRight), dot(vInkAt, screenUp));
  return inkFinish(color, plane, sunless, inShade, inkHatch, inkContourLine(inkContourStep) * inkContour);
}
`;

const INK_MODEL = `${INK_CONTRACT}${INK_COLOR}
vec3 inkPaint(vec3 linear, vec3 albedo) {
  vec3 lit = inkSunlit(linear, albedo);
  float level = inkLevel(lit);
  float sunShade = max(inkSun.litCast, inkSun.facing);
  float inShade = inkInShade(sunShade);
  vec3 color = inkBase(albedo, lit, level, inShade, inkSmoothRelief(level));
  vec3 face = abs(cross(dFdx(vInkAt), dFdy(vInkAt)));
  vec2 plane = face.y >= max(face.x, face.z) ? vInkAt.xz : (face.x > face.z ? vInkAt.zy : vInkAt.xy);
  return inkFinish(color, plane, sunShade, inShade, inkHatch * inkObjectHatch, 0.0);
}
`;

const WORLD_ANCHOR = "vInkAt = (modelMatrix * vec4(transformed, 1.0)).xyz;";

const MODEL_ANCHOR = `mat4 inkFrame = modelMatrix;
#ifdef USE_INSTANCING
inkFrame = modelMatrix * instanceMatrix;
#endif
vInkAt = transformed * vec3(length(inkFrame[0].xyz), length(inkFrame[1].xyz), length(inkFrame[2].xyz));`;

const SUN_SHADOW_STEP = "directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;";

const SUN_SHADE_READ = `float inkShadowHere = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		directLight.color *= inkShadowHere;
		inkSun.anyCast = max(inkSun.anyCast, 1.0 - inkShadowHere);
		inkSun.litCast = max(inkSun.litCast, (1.0 - inkShadowHere) * smoothstep(0.08, 0.2, dot(geometryNormal, directLight.direction)));		inkSun.facing = max(inkSun.facing, 1.0 - smoothstep(-0.02, 0.06, dot(geometryNormal, directLight.direction)));		inkSun.dirView = directLight.direction;`;

const SUN_LOOP = "#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )";

const LAMPS_ASIDE = `inkLamp = reflectedLight.directDiffuse;
reflectedLight.directDiffuse = vec3(0.0);`;

const EMISSIVE_ASIDE = `inkGlow = totalEmissiveRadiance;
totalEmissiveRadiance = vec3(0.0);`;

const FULL_LIGHT = { value: 1 };
const DAY_LIGHT = { value: 1 };

export type InkLight = Pick<Daylight, "sun" | "sunIntensity" | "sky" | "skyIntensity" | "elevation">;

export function syncInkLight(light: InkLight, fullDay: InkLight): void {
  FULL_LIGHT.value = fullLightOf(light);
  DAY_LIGHT.value = fullLightOf(fullDay);
}

function fullLightOf(light: InkLight): number {
  const sunShare = light.sunIntensity * Math.max(Math.sin(light.elevation), 0) * (0.2126 * light.sun.r + 0.7152 * light.sun.g + 0.0722 * light.sun.b);
  const skyShare = light.skyIntensity * (0.2126 * light.sky.r + 0.7152 * light.sky.g + 0.0722 * light.sky.b);
  return Math.max((sunShare + skyShare) / Math.PI, 0.02);
}

export function inkGround(material: THREE.MeshLambertMaterial): void {
  const before = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    paint(shader, WORLD_ANCHOR, INK_GROUND);
  };
  material.customProgramCacheKey = () => `${key()}|ink`;
  material.needsUpdate = true;
}

export function paintModel(shader: THREE.WebGLProgramParametersWithUniforms): void {
  paint(shader, MODEL_ANCHOR, INK_MODEL);
}

function paint(shader: THREE.WebGLProgramParametersWithUniforms, anchor: string, chunk: string): void {
  if (shader.fragmentShader.includes("inkPaint(")) return;
  shader.vertexShader = injectAfter(OWNER, shader.vertexShader, "#include <common>", "varying vec3 vInkAt;");
  shader.vertexShader = injectAfter(OWNER, shader.vertexShader, "#include <begin_vertex>", anchor);
  Object.assign(shader.uniforms, inkUniforms());
  shader.fragmentShader = injectAfter(OWNER, shader.fragmentShader, "#include <common>", chunk);
  shader.fragmentShader = injectAfter(OWNER, shader.fragmentShader, "#include <emissivemap_fragment>", EMISSIVE_ASIDE);
  shader.fragmentShader = replaceChunk(OWNER, shader.fragmentShader, "#include <lights_fragment_begin>", sunShadeLights());
  shader.fragmentShader = injectBefore(OWNER, shader.fragmentShader, "#include <opaque_fragment>", "outgoingLight = inkPaint(outgoingLight, diffuseColor.rgb);");
}

function inkUniforms() {
  return {
    inkFullLight: FULL_LIGHT,
    inkDayLight: DAY_LIGHT,
    inkColor: TUNING.color,
    inkShadeLine: TUNING.shadeLine,
    inkHatch: TUNING.hatch,
    inkHatchPx: TUNING.hatchPx,
    inkContour: TUNING.contour,
    inkContourStep: TUNING.contourStep,
    inkContourSoft: TUNING.contourSoft,
    inkContourOpacity: TUNING.contourOpacity,
    inkContourCross: TUNING.contourCross,
    inkObjectHatch: TUNING.objectHatch,
    inkRelief: TUNING.relief,
    inkShadeDark: TUNING.shadeDark,
    inkShadeShift: TUNING.shadeShift,
    inkCastDark: TUNING.castDark,
    inkShadeCut: TUNING.shadeCut,
    inkLitFace: TUNING.litFace,
    inkHeightTint: TUNING.heightTint,
  };
}

function sunShadeLights(): string {
  const sunShade = replaceChunk(OWNER, THREE.ShaderChunk.lights_fragment_begin, SUN_SHADOW_STEP, SUN_SHADE_READ);
  return injectBefore(OWNER, sunShade, SUN_LOOP, LAMPS_ASIDE);
}
