import { CHASSIS } from './chassis';
import { TERRAIN } from './terrain';

const LONE_THINK_EVERY = 4;
const FASTEST = Math.max(...Object.values(CHASSIS).map((c) => c.maxSpeed));

export const PERF = {
  liveMargin: 40,
  lone: { every: LONE_THINK_EVERY, reach: TERRAIN.vision.radius + 2 * FASTEST, playerReach: 300 },
};
