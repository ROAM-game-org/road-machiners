
declare const __TURN_CLOCK__: string;

const SECONDS_PER_DAY = 86400;
const DEFAULT_TURN_CLOCK = 192;

function turnClockSetting(): string {
  if (typeof __TURN_CLOCK__ === 'string') return __TURN_CLOCK__;
  return (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.TURN_CLOCK ?? '';
}

function turnClock(raw: string): number {
  if (raw === '') return DEFAULT_TURN_CLOCK;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`TURN_CLOCK must be clock seconds per turn above 0, got ${raw}`);
  return seconds;
}

export const TURN_CLOCK_SECONDS = turnClock(turnClockSetting());

export const TIME = {
  turnsPerDay: Math.round(SECONDS_PER_DAY / TURN_CLOCK_SECONDS),
  startHour: 7,
  sunrise: 6,
  sunset: 20,
  noonElevation: 40,
  sunHeat: 2.5,
  nightSight: 0.5,
  shadeAlpha: 0.35,
  shadeFadeElevation: 10,
  shadeReach: 25,
  shadeSamples: 20,
  obstacleShade: { rock: 1.2, wreck: 1.6, building: 2.5 } as Record<
    string,
    number
  >,
};
