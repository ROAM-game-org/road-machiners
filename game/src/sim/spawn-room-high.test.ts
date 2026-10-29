import { spawnRoomOnSeeds } from '../test/spawn-room-kit';

spawnRoomOnSeeds(Array.from({ length: 10 }, (_, i) => i + 11));
