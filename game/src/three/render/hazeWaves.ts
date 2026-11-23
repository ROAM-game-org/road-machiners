const TAU = 2 * Math.PI;

export const HAZE_WAVES = {
  waves: [
    { wave: 4.7, speed: 2.9, heading: 0.4, weight: 1 },
    { wave: 2.6, speed: 4.1, heading: 2.3, weight: 0.6 },
    { wave: 1.4, speed: 6.3, heading: 4.1, weight: 0.35 },
  ],
  warp: { wave: 9, speed: 0.9, depth: 1.6 },
};

export const HAZE_WAVE_WEIGHT = HAZE_WAVES.waves.reduce((sum, w) => sum + w.weight, 0);

export function glslFloat(x: number): string {
  return x.toFixed(4);
}

type WaveNames = { point: string; time: string; warp: string; out: string };

export function hazeWavesGlsl(names: WaveNames): string {
  const { warp } = HAZE_WAVES;
  const lines = [
    `  vec2 ${names.warp} = ${glslFloat(warp.depth)} * vec2(`,
    `    sin(${names.point}.y * ${glslFloat(TAU / warp.wave)} + ${names.time} * ${glslFloat(warp.speed)}),`,
    `    sin(${names.point}.x * ${glslFloat(TAU / warp.wave * 0.83)} - ${names.time} * ${glslFloat(warp.speed * 1.37)}));`,
    ...HAZE_WAVES.waves.map((w) => waveGlsl(w, names)),
  ];
  return lines.join('\n');
}

function waveGlsl(w: (typeof HAZE_WAVES.waves)[number], names: WaveNames): string {
  const dir = `vec2(${glslFloat(Math.cos(w.heading))}, ${glslFloat(Math.sin(w.heading))})`;
  const phase = `dot(${names.point} + ${names.warp}, ${dir}) * ${glslFloat(TAU / w.wave)} - ${names.time} * ${glslFloat(w.speed)}`;
  return `  ${names.out} += ${glslFloat(w.weight)} * vec2(sin(${phase}), cos(${phase} * 0.77));`;
}
