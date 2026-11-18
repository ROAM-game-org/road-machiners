import { ICONS } from './dash-icons.js';

const K = 4;
const px = (css) => `${css * K}px`;

const style = document.createElement('style');
style.textContent = `
@font-face { font-family: "Routed Gothic Narrow"; src: url("/game/src/ui/fonts/routed-gothic-narrow.woff2") format("woff2"); }
.part-stats .s-lcd { position: absolute; }
.part-stats .s-lcd .ghost, .part-stats .s-lcd .val { position: absolute; right: 0; top: 0; white-space: nowrap; font-family: "TC Calculator Digits", monospace; font-size: ${px(24)}; line-height: ${px(24)}; }
.part-stats .s-lcd .ghost { color: #4a2d12; }
.part-stats .s-icon { color: #e4d1a5; filter: drop-shadow(0 ${px(0.8)} 0 #00000066); }
.part-stats .s-icon svg { width: 100%; height: 100%; display: block; fill: currentColor; }
.part-stats .s-icon.coin svg circle { fill: none; stroke: currentColor; }
.part-stats .s-icon.coin svg path { fill: none; stroke: currentColor; }
.part-stats .s-unit { white-space: nowrap; text-transform: uppercase; }
`;
document.head.append(style);

export default function statsOverlay(api) {
  const [money, supplies, unit, health] = api.live.items;
  const lcd = (name, item) => {
    const z = api.zone(name, 's-lcd');
    z.style.color = item.color;
    const glow = item.shadow.replace(/(-?[\d.]+)px/g, (_, n) => `${n * K}px`);
    z.innerHTML = `<span class="ghost">${item.ghost}</span><span class="val">${item.text}</span>`;
    z.style.overflow = 'visible';
    z.querySelector('.val').style.textShadow = glow;
  };
  lcd('money', money); lcd('supplies', supplies); lcd('health', health);

  const icon = (name, art, cls = '') => { const z = api.zone(name, `s-icon ${cls}`); z.innerHTML = art; };
  icon('coin', ICONS.coin, 'coin'); icon('bag', ICONS.supplies); icon('cross', ICONS.health);

  const u = api.zone('unit', 's-unit');
  u.textContent = unit.text;
  Object.assign(u.style, { font: unit.font.replace(/[\d.]+px/, px(12)), color: 'rgb(228, 209, 165)', letterSpacing: px(0.24), lineHeight: px(19), overflow: 'visible', webkitTextStroke: '0.03em currentColor' });
}
