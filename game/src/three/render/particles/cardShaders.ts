export const CARD_SHAPES = 4;
export const ROUND_SHAPE = CARD_SHAPES;
export const CLUMP_FIRST = ROUND_SHAPE + 1;
export const CLUMP_SHAPES = 4;
export const HAZE_SHAPE = CLUMP_FIRST + CLUMP_SHAPES;
export const PLUME_SHAPE = HAZE_SHAPE + CARD_SHAPES;
export const GLOW_IN_LIT = 32;
export const ATLAS_CELLS = 3;

const CARD_LIGHT = { scatter: 0.7 };
const BILLOW = { fade: { soft: 0.03, crisp: 0.15 }, opacity: 0.95, radius: 0.8, linePx: 1.6, curl: { from: 0.45, to: 0.75, down: 0.5 }, curlBreaks: 3, curlGaps: 0.35, lineTone: 0.45, lift: 0.5, paper: [0.78, 0.78, 0.8] };
const DENSITY = { gain: 2.2, boil: { scale: 1.6, speed: 0.12, low: 0.8, high: 1.15 }, softMeters: 1.5 };
export const DUST_RIM = { inner: 0.55, outer: 0.85 };
const DUST_SAND = [0.85, 0.66, 0.42];
const FIRE = { edge: { full: 0.42, gone: 0.8 }, fadeAlpha: 0.3, opacityGain: 1.5, thin: { soft: 0.25, crisp: 0.45 }, rim: 0.18, rimTone: [0.8, 0.3, 0.2], core: 0.55, coreShare: 0.7, yellow: [1, 0.8, 0.25], taper: { from: 0.05, to: 0.2, tip: 0.12 } };
const ROUND_EDGE = '(1.0 - smoothstep(0.84, 1.0, length(vBall)))';
const CLUMP_EDGE = { from: 0, to: 1 };
const SHAPE_ALPHA = `mix(texture2D(shapes, vUv).a, smoothstep(${CLUMP_EDGE.from.toFixed(2)}, ${CLUMP_EDGE.to.toFixed(2)}, texture2D(shapes, vUv).a), vClump)`;
const CARD_BODY = `mix(${SHAPE_ALPHA}, pow(max(0.0, 1.0 - dot(vBall, vBall)), 2.0), vRound)`;
const BALL_DEPTH = 'gl_FragDepth = (vDepth.x + vDepth.y * sqrt(max(0.0, 1.0 - dot(vBall, vBall)))) * 0.5 + 0.5;';
const INV_PI = (1 / Math.PI).toFixed(6);

const f = (n: number) => n.toFixed(3);
const v3 = (c: number[]) => `vec3(${c.map(f).join(', ')})`;

export const INK_SHADE = `
  uniform float shadeDark;
  uniform float shadeShift;
  uniform float castDark;
  vec3 inkShade(vec3 color) {
    vec3 tinted = color * vec3(0.82, 0.88, 1.15);
    vec3 luma = vec3(0.2126, 0.7152, 0.0722);
    vec3 cool = tinted * dot(color, luma) / max(dot(tinted, luma), 0.0001);
    return mix(color, cool, shadeShift) * (1.0 - shadeDark) * (1.0 - castDark);
  }
`;

const VARYINGS = `
  varying vec2 vUv;
  varying vec2 vBall;
  varying float vRound;
  varying float vClump;
  varying vec4 vTint;
  varying vec3 vSun;
  varying vec3 vUp;
  varying vec2 vDepth;
  varying float vViewZ;
  varying float vSpin;
  varying float vHaze;
  varying float vPlume;
  varying vec2 vCell;
  varying float vGlow;
  varying float vStretch;
`;

export const CARD_VERTEX = `
  attribute vec3 offset;
  attribute vec3 stretch;
  attribute vec2 sizeSpin;
  attribute float shape;
  attribute vec4 tint;
  uniform vec3 sunDir;
  uniform float sandTint;
  ${VARYINGS}
  void main() {
    vSpin = sizeSpin.y;
    float c = cos(sizeSpin.y);
    float s = sin(sizeSpin.y);
    vec2 turned = mat2(c, s, -s, c) * (uv - 0.5) + 0.5;
    vGlow = shape > ${f(GLOW_IN_LIT - 0.5)} ? 1.0 : 0.0;
    float base = shape - vGlow * ${f(GLOW_IN_LIT)};
    vPlume = base > ${f(PLUME_SHAPE - 0.5)} ? 1.0 : 0.0;
    vHaze = base > ${f(HAZE_SHAPE - 0.5)} && vPlume < 0.5 ? 1.0 : 0.0;
    float atlasShape = base - vHaze * ${f(HAZE_SHAPE)} - vPlume * ${f(PLUME_SHAPE)};
    float col = mod(atlasShape, ${ATLAS_CELLS}.0);
    float row = floor(atlasShape / ${ATLAS_CELLS}.0);
    vCell = vec2(col, row);
    vUv = (turned + vec2(col, row)) / ${ATLAS_CELLS}.0;
    vBall = (uv - 0.5) * 2.0;
    vRound = abs(base - ${f(ROUND_SHAPE)}) < 0.5 ? 1.0 : 0.0;
    vClump = atlasShape > ${f(CLUMP_FIRST - 0.5)} && atlasShape < ${f(CLUMP_FIRST + CLUMP_SHAPES - 0.5)} ? 1.0 : 0.0;
    vTint = vec4(mix(tint.rgb, ${v3(DUST_SAND)}, sandTint), tint.a);
    vSun = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
    vUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    vec4 mv = modelViewMatrix * vec4(offset, 1.0);
    vViewZ = -mv.z;
    vec2 along = (modelViewMatrix * vec4(stretch, 0.0)).xy;
    float reach = length(along);
    vStretch = reach / max(sizeSpin.x + reach, 0.0001);
    vec2 ax = reach > 0.0001 ? along / reach : vec2(1.0, 0.0);
    vec2 corner = position.xy * sizeSpin.x;
    mv.xy += reach > 0.0001 ? ax * position.x * (sizeSpin.x + reach) + vec2(-ax.y, ax.x) * corner.y - along * 0.5 : corner;
    float centreNdc = projectionMatrix[2][2] * mv.z + projectionMatrix[3][2];
    vDepth = vec2(centreNdc, projectionMatrix[2][2] * sizeSpin.x * 0.5);
    gl_Position = projectionMatrix * mv;
  }
`;

const INK_FIRE = `
  uniform float fxInk;
  float inkCut(float body, float edge) {
    float aa = max(fwidth(body), 0.0001) * 0.75;
    return smoothstep(edge - aa, edge + aa, body);
  }
  float fireEdge(float alpha) {
    return mix(${f(FIRE.edge.gone)}, ${f(FIRE.edge.full)}, smoothstep(0.0, ${f(FIRE.fadeAlpha)}, alpha));
  }
  float fireBody(float body) {
    float taper = smoothstep(${f(FIRE.taper.from)}, ${f(FIRE.taper.to)}, vStretch);
    vec2 tongue = vec2(vBall.x, vBall.y / max(${f(FIRE.taper.tip)}, 1.0 - taper * smoothstep(-0.5, 1.0, vBall.x)));
    return mix(body, clamp(1.0 - length(tongue), 0.0, 1.0), taper);
  }
  float fireCover(float body, float alpha, float edge) {
    float sharp = smoothstep(${f(FIRE.thin.soft)}, ${f(FIRE.thin.crisp)}, alpha);
    return mix(alpha * body, inkCut(body, edge) * min(1.0, alpha * ${f(FIRE.opacityGain)}), sharp);
  }
  vec3 fireInks(vec3 tint, float body, float edge) {
    float inner = inkCut(body, mix(edge, 1.0, ${f(FIRE.rim)}));
    float core = inkCut(body, mix(edge, 1.0, ${f(FIRE.core)}));
    vec3 color = mix(tint * ${v3(FIRE.rimTone)}, tint, inner);
    return mix(color, mix(tint, ${v3(FIRE.yellow)}, ${f(FIRE.coreShare)}), core);
  }
`;

const BILLOW_INK = `
  uniform float smokeLines;
  ${INK_SHADE}
  float inkHash(float n) {
    return fract(sin(n * 12.9898) * 43758.5453);
  }
  float billowCurl(float r, float rAa, vec2 under) {
    float width = ${f(BILLOW.linePx)} * fwidth(r);
    float ring = smoothstep(${f(BILLOW.radius)} - width - rAa, ${f(BILLOW.radius)} - width + rAa, r);
    float side = smoothstep(${f(BILLOW.curl.from)}, ${f(BILLOW.curl.to)}, dot(vBall / max(r, 0.0001), under));
    float turn = (atan(vBall.y, vBall.x) + vSpin) / 6.28318 * ${f(BILLOW.curlBreaks)};
    float kept = step(${f(BILLOW.curlGaps)}, inkHash(mod(floor(turn), ${f(BILLOW.curlBreaks)})));
    return ring * side * kept;
  }
`;

export const LIT_FRAGMENT = `
  uniform sampler2D shapes;
  uniform vec3 sunColor;
  uniform vec3 skyColor;
  uniform vec3 groundColor;
  ${VARYINGS}
  ${INK_FIRE}
  ${BILLOW_INK}
  vec4 softLit(float body) {
    vec3 n = normalize(vec3(vBall, sqrt(max(0.0, 1.0 - dot(vBall, vBall) * 0.5))));
    vec3 sky = mix(groundColor, skyColor, 0.5 * dot(n, vUp) + 0.5);
    float wrap = 0.5 * dot(n, vSun) + 0.5;
    vec3 light = (mix(${f(CARD_LIGHT.scatter)}, 1.0, wrap * wrap) * sunColor + sky) * ${INV_PI};
    return vec4(vTint.rgb * light, vTint.a * body);
  }
  vec4 billow(float body) {
    float r = length(vBall);
    float rAa = fwidth(r) * 0.75 + 0.0001;
    float disc = 1.0 - smoothstep(${f(BILLOW.radius)} - rAa, ${f(BILLOW.radius)} + rAa, r);
    float sharp = smoothstep(${f(BILLOW.fade.soft)}, ${f(BILLOW.fade.crisp)}, vTint.a) * (1.0 - vHaze) * (1.0 - vPlume) * (1.0 - vClump);
    vec3 pale = mix(vTint.rgb, ${v3(BILLOW.paper)}, ${f(BILLOW.lift)} * (1.0 - vPlume));
    vec3 flat_ = pale * (sunColor + mix(groundColor, skyColor, 0.75)) * ${INV_PI};
    float sunAcross = smoothstep(0.02, 0.2, length(vSun.xy));
    vec2 awaySun = -normalize(mix(vec2(0.0, 1.0), vSun.xy / max(length(vSun.xy), 0.0001), sunAcross));
    vec2 under = normalize(mix(awaySun, vec2(0.0, -1.0), ${f(BILLOW.curl.down)}));
    vec3 color = mix(flat_, inkShade(flat_) * ${f(BILLOW.lineTone)}, billowCurl(r, rAa, under) * smokeLines * sharp);
    return vec4(color, mix(vTint.a * body, disc * ${f(BILLOW.opacity)}, sharp));
  }
  vec4 fireCard(float body) {
    float shaped = fireBody(body);
    float edge = fireEdge(vTint.a);
    return vec4(fireInks(vTint.rgb, shaped, edge), fireCover(shaped, vTint.a, edge));
  }
  void main() {
    float body = ${CARD_BODY} * ${ROUND_EDGE};
    vec4 inked = vGlow > 0.5 ? fireCard(body) : billow(body);
    vec4 painted = mix(softLit(body), inked, fxInk);
    if (painted.a <= 0.003) discard;
    ${BALL_DEPTH}
    gl_FragColor = painted;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const GLOW_FRAGMENT = `
  uniform sampler2D shapes;
  ${VARYINGS}
  ${INK_FIRE}
  void main() {
    float body = ${CARD_BODY} * ${ROUND_EDGE};
    float soft = vTint.a * body;
    float shaped = fireBody(body);
    float edge = fireEdge(vTint.a);
    float crisp = fireCover(shaped, vTint.a, edge);
    if (mix(soft, crisp, fxInk) <= 0.003) discard;
    ${BALL_DEPTH}
    vec3 added = linearToOutputTexel(vec4(vTint.rgb, 1.0)).rgb * soft;
    vec3 covered = linearToOutputTexel(vec4(fireInks(vTint.rgb, shaped, edge), 1.0)).rgb * crisp;
    gl_FragColor = vec4(mix(added, covered, fxInk), crisp * fxInk);
  }
`;

export const DENSITY_FRAGMENT = `
  uniform sampler2D sceneDepth;
  uniform vec2 densitySize;
  uniform vec2 nearFar;
  uniform vec2 densityRim;
  uniform float playSeconds;
  ${VARYINGS}
  float densityHash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float densityNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 t = fract(p);
    t = t * t * (3.0 - 2.0 * t);
    return mix(mix(densityHash(cell), densityHash(cell + vec2(1.0, 0.0)), t.x), mix(densityHash(cell + vec2(0.0, 1.0)), densityHash(cell + vec2(1.0, 1.0)), t.x), t.y);
  }
  void main() {
    float r2 = dot(vBall, vBall);
    if (r2 >= 1.0) discard;
    float c = cos(vSpin);
    float s = sin(vSpin);
    vec2 q = mat2(c, s, -s, c) * vBall * ${f(DENSITY.boil.scale)} + vCell * 7.3;
    float t = playSeconds * ${f(DENSITY.boil.speed)};
    float boil = densityNoise(q + vec2(t, -t * 0.7)) * 0.6 + densityNoise(q * 2.3 + vec2(-t * 1.3, t)) * 0.4;
    float r = sqrt(r2) / mix(${f(DENSITY.boil.low)}, ${f(DENSITY.boil.high)}, boil);
    float d = (1.0 - smoothstep(densityRim.x, densityRim.y, r)) * vTint.a * ${f(DENSITY.gain)};
    float scene = texture2D(sceneDepth, gl_FragCoord.xy / densitySize).r;
    float sceneZ = nearFar.x + scene * (nearFar.y - nearFar.x);
    d *= smoothstep(0.0, ${f(DENSITY.softMeters)}, sceneZ - vViewZ);
    gl_FragColor = vec4(vTint.rgb * d, d);
  }
`;
