import { defineConfig, type Plugin } from 'vite'
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

const TYPED_MATRICES = [
  { file: 'three/build/three.core.js', from: /(class Matrix3 \{[\s\S]*?this\.elements = )\[(\s*1, 0, 0,\s*0, 1, 0,\s*0, 0, 1\s*)\];/, to: '$1new Float64Array( [$2] );' },
  { file: 'three/build/three.core.js', from: /(class Matrix4 \{[\s\S]*?this\.elements = )\[(\s*1, 0, 0, 0,\s*0, 1, 0, 0,\s*0, 0, 1, 0,\s*0, 0, 0, 1\s*)\];/, to: '$1new Float64Array( [$2] );' },
  { file: 'three/build/three.module.js', from: /_m0\.elements\.map\( \( v \) => v\.toFixed\( 4 \) \)/, to: 'Array.from( _m0.elements, ( v ) => v.toFixed( 4 ) )' },
]

function typedMatrices(): Plugin {
  return {
    name: 'typed-matrices',
    enforce: 'pre',
    transform(code, id) {
      const edits = TYPED_MATRICES.filter((edit) => id.includes(edit.file))
      if (edits.length === 0) return null
      for (const edit of edits) if (!edit.from.test(code)) throw new Error(`three no longer has ${edit.from} in ${edit.file}`)
      return { code: edits.reduce((text, edit) => text.replace(edit.from, edit.to), code), map: null }
    },
  }
}

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [typedMatrices()],
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
