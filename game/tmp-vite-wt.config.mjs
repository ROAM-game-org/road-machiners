import base from './vite.config.ts';
import { mergeConfig } from 'vite';
const cfg = typeof base === 'function' ? await base({ command: 'serve', mode: 'development' }) : base;
export default mergeConfig(cfg, { server: { fs: { allow: ['/Users/boris/Documents/Korovan'] } } });
