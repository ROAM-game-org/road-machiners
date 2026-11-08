import * as THREE from "three";
import { TUNING } from "./styleTuning";

const SHARED = `
varying vec3 vStyleAt;
uniform float styleFullLight;
float styleRoad = 0.0;
float styleEdge = 0.0;
float styleHeight = 0.0;
vec2 styleSlope = vec2(0.0);
float styleHasHeight = 0.0;
float styleRise = 0.0;
float styleCastShade = 0.0;
float styleCastRaw = 0.0;
float styleFacingShade = 0.0;
vec3 styleSunView = vec3(0.0, 1.0, 0.0);
float styleHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float styleNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(styleHash(cell), styleHash(cell + vec2(1.0, 0.0)), f.x), mix(styleHash(cell + vec2(0.0, 1.0)), styleHash(cell + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 styleFit(vec3 v) { return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081); }
vec3 styleToScreen(vec3 linear) {
  vec3 color = linear * 1.05 / 0.6;
  color = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777)) * color;
  color = styleFit(color);
  color = clamp(mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602)) * color, 0.0, 1.0);
  return mix(color * 12.92, 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, color));
}
vec3 styleFromScreen(vec3 shown) {
  vec3 color = clamp(shown, 0.0, 1.0);
  return mix(color / 12.92, pow((color + 0.055) / 1.055, vec3(2.4)), step(0.04045, color));
}
`;

const LIT = `
vec3 styleSunlit(vec3 linear, vec3 albedo) { return linear / max(albedo, vec3(0.001)); }
float styleLevel(vec3 lit) { return dot(lit, vec3(0.2126, 0.7152, 0.0722)) / styleFullLight; }
vec3 styleAtLevel(vec3 albedo, vec3 lit, float level, float wanted) { return albedo * lit * wanted / max(level, 0.05); }
float styleLuma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float styleStrokes(vec2 p, vec2 dir, float spacing, float width, float longest, float kept, float seed) {
  float along = dot(p, dir) / spacing + (styleNoise(p / 5.0 + seed) - 0.5) * 0.3;
  float row = floor(along);
  float v = dot(p, vec2(-dir.y, dir.x)) / longest + styleHash(vec2(row, seed)) * 9.0;
  float aa = fwidth(along);
  float line = 1.0 - smoothstep(width - aa, width + aa, abs(fract(along) - 0.5));
  return line * step(styleHash(vec2(floor(v), row + seed)), kept) * (1.0 - smoothstep(0.4, 0.9, aa));
}
`;

const INK_RISE_FULL_METERS = 3;
const INK_STROKE_LENGTH = 1.8;
const INK_BAND_SLOPE_FROM = 0.1;
const INK_BAND_SLOPE_FULL = 0.16;
const INK_BAND_SOFT = 0.35;

const INK = `${SHARED}${LIT}
uniform float inkColor;
uniform float inkShadeLine;
uniform float inkHatch;
uniform float inkHatchSize;
uniform float inkContour;
uniform float inkContourStep;
uniform float inkContourSoft;
uniform float inkContourOpacity;
uniform float inkContourCross;
uniform float inkObjectHatch;
uniform float inkRelief;
uniform float inkHeightTint;
const vec3 INK_BLACK = vec3(0.08, 0.07, 0.1);
float inkContourLine(float interval) {
  float height = styleHasHeight > 0.5 ? styleHeight : vStyleAt.y;
  float px = max(length(fwidth(vStyleAt.xz)), 0.0005);
  vec2 grad = styleHasHeight > 0.5 ? styleSlope : vec2(length(vec2(dFdx(height), dFdy(height))) / px, 0.0);
  float slope = length(grad);
  float across = (height - floor(height / interval + 0.5) * interval) / max(slope, 0.002);
  float solid = 1.0 - smoothstep(px * 0.5, px * 1.3, abs(across));
  float spacing = max(0.9, px * 16.0);
  float side = abs(grad.x) > abs(grad.y) ? vStyleAt.z : vStyleAt.x;
  float w = across / (spacing * 0.9);
  float slant = fract(side / spacing - w * 0.7 + 0.5) - 0.5;
  float cross_ = fract(side / spacing + w * 0.7 + 0.5) - 0.5;
  float reach = inkContourCross > 0.5 ? min(abs(slant), abs(cross_)) : abs(slant);
  float thread = max(0.05, px * 1.1) / spacing;
  float stroked = (1.0 - smoothstep(thread, thread + px / spacing, reach)) * (1.0 - smoothstep(0.42, 0.5, abs(w)));
  float line = mix(solid, stroked, inkContourSoft);
  return line * smoothstep(0.004, 0.02, slope) * inkContourOpacity;
}
vec3 stylePaint(vec3 linear, vec3 albedo) {
  vec3 lit = styleSunlit(linear, albedo);
  float level = styleLevel(lit);
  float facingShade = styleFacingShade;
#ifdef STYLE_GROUND
  vec3 smoothUp = normalize((viewMatrix * vec4(-styleSlope.x, 1.0, -styleSlope.y, 0.0)).xyz);
  facingShade = mix(facingShade, 1.0 - smoothstep(-0.02, 0.06, dot(smoothUp, styleSunView)), styleHasHeight);
#endif
#ifdef STYLE_GROUND
  float sunShade = max(styleCastRaw, facingShade);
#else
  float sunShade = max(styleCastShade, facingShade);
#endif
  float shadeAa = fwidth(sunShade) + 0.004;
  float inShade = smoothstep(0.5 - shadeAa, 0.5 + shadeAa, sunShade);
  vec3 flat_ = styleToScreen(styleAtLevel(albedo, lit, level, 1.0));
  vec3 pastel = mix(flat_, vec3(0.98, 0.95, 0.86), 0.32);
  pastel = mix(pastel, pastel * vec3(0.66, 0.68, 0.84), inShade);
  vec3 vivid = max(mix(vec3(styleLuma(flat_)), flat_, 1.3), 0.0);
  vivid = mix(vivid, vivid * vec3(0.5, 0.5, 0.66), inShade);
  vec3 color = max(mix(pastel, vivid, inkColor), 0.0);
  color *= mix(1.0, clamp(0.55 + 0.5 * level, 0.7, 1.15), inkRelief);
#ifdef STYLE_GROUND
  float bandAt = styleHeight / inkContourStep;
  float bandAa = clamp(fwidth(bandAt), 0.0001, 1.0);
  float band = floor(bandAt) + smoothstep(1.0 - max(bandAa, ${INK_BAND_SOFT.toFixed(2)}), 1.0, fract(bandAt));
  float bandRise = band * inkContourStep - (styleHeight - styleRise);
  float high = clamp(0.5 + bandRise / ${(2 * INK_RISE_FULL_METERS).toFixed(1)}, 0.0, 1.0);
  float heightTint = inkHeightTint * styleHasHeight * (1.0 - styleRoad) * smoothstep(${INK_BAND_SLOPE_FROM.toFixed(3)}, ${INK_BAND_SLOPE_FULL.toFixed(3)}, length(styleSlope));
  color *= mix(1.0, mix(0.93, 1.05, high), heightTint);
  color = mix(color, color * vec3(0.95, 0.97, 1.03), (1.0 - high) * heightTint * 0.5);
#endif
#ifdef STYLE_GROUND
  vec3 screenRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 screenUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec2 plane = vec2(dot(vStyleAt, screenRight), dot(vStyleAt, screenUp));
#else
  vec3 face = abs(cross(dFdx(vStyleAt), dFdy(vStyleAt)));
  vec2 plane = face.y >= max(face.x, face.z) ? vStyleAt.xz : (face.x > face.z ? vStyleAt.zy : vStyleAt.xy);
#endif
  float shadeMarks = styleStrokes(plane, vec2(0.7071, -0.7071), inkHatchSize, 0.14, inkHatchSize * ${INK_STROKE_LENGTH.toFixed(1)}, 0.6, 8.0) * inShade;
#ifdef STYLE_GROUND
  float hatchShare = inkHatch;
#else
  float hatchShare = inkHatch * inkObjectHatch;
#endif
  color = mix(color, color * 0.55, shadeMarks * hatchShare);
  float shadeLine = 1.0 - smoothstep(0.6, 1.3, abs(sunShade - 0.5) / max(fwidth(sunShade), 0.0006));
#ifdef STYLE_GROUND
  float contour = inkContourLine(inkContourStep) * inkContour;
#else
  float contour = 0.0;
#endif
  color = mix(color, INK_BLACK, max(max(shadeLine * inkShadeLine, styleEdge), contour));
  return styleFromScreen(color);
}
`;

const FULL_LIGHT = { value: 1 };

export function syncStyleLight(sunShare: number, skyShare: number): void {
  FULL_LIGHT.value = Math.max((sunShare + skyShare) / Math.PI, 0.02);
}

const MODEL_ANCHOR = `mat4 styleFrame = modelMatrix;
#ifdef USE_INSTANCING
styleFrame = modelMatrix * instanceMatrix;
#endif
vStyleAt = transformed * vec3(length(styleFrame[0].xyz), length(styleFrame[1].xyz), length(styleFrame[2].xyz));`;

function worldAnchor(worldAnchored: boolean): string {
  return worldAnchored ? "vStyleAt = (modelMatrix * vec4(transformed, 1.0)).xyz;" : MODEL_ANCHOR;
}

const SUN_SHADOW_STEP = "directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;";

function sunShadeLights(): string {
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  if (!chunk.includes(SUN_SHADOW_STEP)) throw new Error("Style paint found no sun shadow step to read");
  return chunk.replace(SUN_SHADOW_STEP, `float styleShadowHere = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		directLight.color *= styleShadowHere;
		styleCastRaw = max(styleCastRaw, 1.0 - styleShadowHere);
		styleCastShade = max(styleCastShade, (1.0 - styleShadowHere) * smoothstep(0.08, 0.2, dot(geometryNormal, directLight.direction)));
		styleFacingShade = max(styleFacingShade, 1.0 - smoothstep(-0.02, 0.06, dot(geometryNormal, directLight.direction)));
		styleSunView = directLight.direction;`);
}

export function paintStyle(shader: THREE.WebGLProgramParametersWithUniforms, worldAnchored: boolean): void {
  if (shader.fragmentShader.includes("stylePaint")) return;
  if (!shader.fragmentShader.includes("#include <opaque_fragment>")) throw new Error("Style paint found no output step");
  shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vStyleAt;").replace("#include <begin_vertex>", `#include <begin_vertex>\n${worldAnchor(worldAnchored)}`);
  shader.uniforms.styleFullLight = FULL_LIGHT;
  Object.assign(shader.uniforms, { inkColor: TUNING.color, inkShadeLine: TUNING.shadeLine, inkHatch: TUNING.hatch, inkHatchSize: TUNING.hatchSize, inkContour: TUNING.contour, inkContourStep: TUNING.contourStep, inkContourSoft: TUNING.contourSoft, inkContourOpacity: TUNING.contourOpacity, inkContourCross: TUNING.contourCross, inkObjectHatch: TUNING.objectHatch, inkRelief: TUNING.relief, inkHeightTint: TUNING.heightTint });
  shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${worldAnchored ? "#define STYLE_GROUND\n" : ""}${INK}`).replace("#include <lights_fragment_begin>", sunShadeLights()).replace("#include <opaque_fragment>", "outgoingLight = stylePaint(outgoingLight, diffuseColor.rgb);\n#include <opaque_fragment>");
}
