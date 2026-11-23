import { defineConfig, type Plugin } from 'vite'
import { readdirSync, statSync } from 'node:fs'
import { gameVersion } from './src/version'
import { publicHashes } from './src/public-files'
import { typedMatrices, typedMatricesWhilePrebundling } from './scripts/typed-matrices.mjs'

function sfxBytes(dirs: string[]): Record<string, number> {
  const sizes = dirs.flatMap((dir) => readdirSync(dir).filter((name) => /\.(ogg|m4a)$/.test(name)).map((name) => [name, statSync(`${dir}/${name}`).size]))
  return Object.fromEntries(sizes)
}

const ITCH_HTML5_FILE_LIMIT = 1000

function itchFileLimit(): Plugin {
  let outDir = ''
  return {
    name: 'itch-file-limit',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir },
    closeBundle() {
      const files = readdirSync(outDir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).length
      if (files > ITCH_HTML5_FILE_LIMIT) throw new Error(`The build has ${files} files, and itch.io rejects an HTML5 upload over ${ITCH_HTML5_FILE_LIMIT}.`)
    },
  }
}

function envText(name: string): string {
  return JSON.stringify(process.env[name] ?? '')
}

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [typedMatrices(), itchFileLimit()],
  optimizeDeps: { esbuildOptions: { plugins: [typedMatricesWhilePrebundling()] } },
  server: { hmr: false, ...(process.env.ROAM_NO_WATCH ? { watch: null } : {}) },
  define: {
    __GAME_VERSION__: JSON.stringify(gameVersion(process.cwd())),
    __SFX_BYTES__: JSON.stringify(sfxBytes(['public/sfx', 'public/sfx-m4a'])),
    __PUBLIC_HASHES__: JSON.stringify(command === 'build' ? publicHashes('public') : {}),
    __SAVE_SCOPE__: envText('SAVE_SCOPE'),
    __MAP_DRAFT__: envText('MAP_DRAFT'),
    __TURN_CLOCK__: envText('TURN_CLOCK'),
    __TRAFFIC__: envText('TRAFFIC'),
    __ERROR_REPORT_URL__: envText('ERROR_REPORT_URL'),
    __ERROR_REPORT_BUILD__: envText('ERROR_REPORT_BUILD'),
    __FEEDBACK_URL__: envText('FEEDBACK_URL'),
  },
  build: { sourcemap: 'hidden' },
}))
