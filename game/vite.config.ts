import { defineConfig } from 'vite'
import { readdirSync, statSync } from 'node:fs'
import { gameVersion } from './src/version'
import { publicHashes } from './src/public-files'

function sfxBytes(dirs: string[]): Record<string, number> {
  const sizes = dirs.flatMap((dir) => readdirSync(dir).filter((name) => /\.(ogg|m4a)$/.test(name)).map((name) => [name, statSync(`${dir}/${name}`).size]))
  return Object.fromEntries(sizes)
}

export default defineConfig(({ command }) => ({
  base: './',
  server: { hmr: false, ...(process.env.ROAM_NO_WATCH ? { watch: null } : {}) },
  define: {
    __GAME_VERSION__: JSON.stringify(gameVersion(process.cwd())),
    __SFX_BYTES__: JSON.stringify(sfxBytes(['public/sfx', 'public/sfx-m4a'])),
    __PUBLIC_HASHES__: JSON.stringify(command === 'build' ? publicHashes('public') : {}),
    __SAVE_SCOPE__: JSON.stringify(process.env.SAVE_SCOPE ?? ''),
    __ERROR_REPORT_URL__: JSON.stringify(process.env.ERROR_REPORT_URL ?? ''),
    __ERROR_REPORT_BUILD__: JSON.stringify(process.env.ERROR_REPORT_BUILD ?? ''),
    __FEEDBACK_URL__: JSON.stringify(process.env.FEEDBACK_URL ?? ''),
  },
  build: { sourcemap: 'hidden' },
}))
