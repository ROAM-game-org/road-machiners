import { ICONS } from './dash-icons.js';

const K = 4;
const NAMES = ['map', 'journal', 'truck', 'driver', 'menu'];

const style = document.createElement('style');
style.textContent = `
.part-keys .k-icon { color: #e3d0a5; filter: drop-shadow(0 ${K * 0.8}px 0 #2a140866); pointer-events: none; }
.part-keys .k-icon svg { width: 100%; height: 100%; display: block; fill: currentColor; }
.part-keys button.hit { background: none; border: 0; padding: 0; cursor: pointer; }
`;
document.head.append(style);

export default function keysOverlay(api) {
  NAMES.forEach((name, i) => {
    const key = api.sprite(`key${i}`);
    const icon = api.zone(`icon${i}`, 'k-icon');
    icon.innerHTML = ICONS[name];
    const hit = api.zone(`hit${i}`, 'hit', 'button');
    const move = api.follow(icon, `icon${i}`, `icon${i}Down`);
    const down = () => { key.show(1); move(true); };
    const up = () => { key.show(0); move(false); };
    hit.onpointerdown = down;
    hit.onpointerup = hit.onpointerleave = up;
  });
}
