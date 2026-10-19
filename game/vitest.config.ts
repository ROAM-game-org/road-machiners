import { defineConfig } from 'vitest/config';
import { timeoutsOff } from './src/test/timeouts';
import { testWorkers } from './src/test/workers';
import { gameVersion } from './src/version';

const off = timeoutsOff();
export default defineConfig({ define: { __GAME_VERSION__: JSON.stringify(gameVersion(process.cwd())), __SAVE_SCOPE__: JSON.stringify(process.env.SAVE_SCOPE ?? ''), __ERROR_REPORT_URL__: JSON.stringify(''), __ERROR_REPORT_BUILD__: JSON.stringify(''), __FEEDBACK_URL__: JSON.stringify(''), __SFX_BYTES__: JSON.stringify({}), __PUBLIC_HASHES__: JSON.stringify({}) }, assetsInclude: ['**/*.glb'], test: { include: ['src/**/*.test.ts'], globalSetup: ['src/test/empty-template-setup.ts'], css: { include: [/tokens\.css/] },setupFiles: ['src/test/yield-setup.ts'], runner: 'src/test/settled-runner.ts', maxWorkers: testWorkers(), testTimeout: off ? 0 : 30_000, hookTimeout: off ? 0 : 10_000 } });
