import { defineConfig } from 'vite'
import { readdirSync, statSync } from 'node:fs'
import { gameVersion } from './src/version'
import { publicHashes } from './src/public-files'

function sfxBytes(dirs: string[]): Record<string, number> {
  const sizes = dirs.flatMap((dir) => readdirSync(dir).filter((name) => /\.(ogg|m4a)$/.test(name)).map((name) => [name, statSync(`${dir}/${name}`).size]))
  return Object.fromEntries(sizes)
}

function envText(name: string): string {
  return JSON.stringify(process.env[name] ?? '')
}

export default defineConfig(({ command }) => ({
  base: './',
  server: { hmr: false, ...(process.env.ROAM_NO_WATCH ? { watch: null } : {}) },
  define: {
    __GAME_VERSION__: JSON.stringify(gameVersion(process.cwd())),
    __SFX_BYTES__: JSON.stringify(sfxBytes(['public/sfx', 'public/sfx-m4a'])),
    __PUBLIC_HASHES__: JSON.stringify(command === 'build' ? publicHashes('public') : {}),
    __SAVE_SCOPE__: envText('SAVE_SCOPE'),
    __MAP_DRAFT__: envText('MAP_DRAFT'),
    __TURN_CLOCK__: envText('TURN_CLOCK'),
    __ERROR_REPORT_URL__: envText('ERROR_REPORT_URL'),
    __ERROR_REPORT_BUILD__: envText('ERROR_REPORT_BUILD'),
    __FEEDBACK_URL__: envText('FEEDBACK_URL'),
  },
  build: { sourcemap: 'hidden' },
}))
