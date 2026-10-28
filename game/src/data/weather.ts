export const WEATHER = {
  cloudSpacing: 30,
  stormSpacing: 90,
  wind: { x: 0.4, y: -0.14 },
  cloud: { puffs: 4, spread: 2, diameter: 3.5, height: 1.3, opacity: 0.36, color: 0xd5b58a },
  storm: { tilesPerPuff: 80, diameter: 16, height: 1.2, opacity: 0.35, color: 0x9d7954, fadePerSecond: 0.5 },
  clouds: { clear: 0.3, overcast: 0.7, easeTurns: 12, depth: { clear: 0.35, overcast: 0.4 }, scale: 32, speed: 3, period: 32, soft: 0.08, fadeElevation: 0.3 },
  sim: {
    spawnChance: { storm: 0.01, heatwave: 0.004, overcast: 0.004 },
    maxActive: { storm: 3, heatwave: 1, overcast: 1 },
    duration: { storm: [150, 400] as [number, number], heatwave: [25, 50] as [number, number], overcast: [25, 50] as [number, number] },
    stormRadius: [60, 120] as [number, number],
    stormSpeed: [0.4, 1.0] as [number, number],
    stormEdge: 25,
    stormFadeTurns: 30,
    stormExposeTurns: 10,
    effects: {
      storm: { sight: 0.4, spread: 0.15, speed: 0.6, wear: 1.5 },
      heatwave: 1.6,
      overcast: 0,
    },
  },
} as const;
