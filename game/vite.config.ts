import { defineConfig } from 'vite'
import { readdirSync, statSync } from 'node:fs'
import { gameVersion } from './src/version'

function sfxBytes(dir: string): Record<string, number> {
  const sizes = readdirSync(dir).filter((name) => name.endsWith('.ogg')).map((name) => [name, statSync(`${dir}/${name}`).size])
  return Object.fromEntries(sizes)
}

export default defineConfig({
  base: './',
  server: { hmr: false, ...(process.env.ROAM_NO_WATCH ? { watch: null } : {}) },
  define: {
    __GAME_VERSION__: JSON.stringify(gameVersion(process.cwd())),
    __SFX_BYTES__: JSON.stringify(sfxBytes('public/sfx')),
    __SAVE_SCOPE__: JSON.stringify(process.env.SAVE_SCOPE ?? ''),
    __ERROR_REPORT_URL__: JSON.stringify(process.env.ERROR_REPORT_URL ?? ''),
    __ERROR_REPORT_BUILD__: JSON.stringify(process.env.ERROR_REPORT_BUILD ?? ''),
  },
  build: { sourcemap: 'hidden' },
})
