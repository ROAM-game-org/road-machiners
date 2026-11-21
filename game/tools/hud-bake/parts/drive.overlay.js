const K = 4;
const css = (v) => `${v * K}px`;

const style = document.createElement('style');
style.textContent = `
@font-face { font-family: "Routed Gothic Narrow"; src: url("/game/src/ui/fonts/routed-gothic-narrow.woff2") format("woff2"); }
.part-drive .d-svg { overflow: visible; }
.part-drive .d-svg svg { width: 100%; height: 100%; display: block; overflow: visible; }
.part-drive .d-svg svg { width: 100%; height: 100%; display: block; text-rendering: geometricPrecision; shape-rendering: geometricPrecision; }
.part-drive .d-svg text { font-family: "Routed Gothic Narrow", sans-serif; stroke-width: 0.03em; text-anchor: middle; dominant-baseline: central; }
.part-drive .d-label, .part-drive .d-cool { position: absolute; display: grid; place-items: center; white-space: nowrap; text-transform: uppercase; font-family: "Routed Gothic Narrow", sans-serif; -webkit-text-stroke: 0.03em currentColor; overflow: visible; }
.part-drive .d-cool { white-space: normal; text-align: center; line-height: 1.05; letter-spacing: 0.02em; }
.part-drive .d-lamp { position: absolute; border-radius: 50%; }
.part-drive .d-lamp.red.lit { background: radial-gradient(circle at 40% 35%, #ffd0c8, #ef4f3a 45%, transparent 72%); box-shadow: 0 0 6px #ef4f3a; }
.part-drive .d-lamp.lit { background: radial-gradient(circle at 40% 35%, #e4d1a5, #e8a43a 45%, transparent 72%); box-shadow: 0 0 6px #e8a43a; }
.part-drive button.hit { background: none; border: 0; padding: 0; cursor: pointer; }
`;
document.head.append(style);

const SVGNS = 'http://www.w3.org/2000/svg';
const node = (tag, attrs, parent) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.append(n);
  return n;
};
const svgZone = (api, name, box) => {
  const z = api.zone(name, 'd-svg');
  const svg = node('svg', { viewBox: `${box[0]} ${box[1]} ${box[2] - box[0]} ${box[3] - box[1]}` });
  z.append(svg);
  return svg;
};

const polar = (cx, cy, sweep, share, r) => {
  const a = (share - 0.5) * sweep * Math.PI / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
};
const arc = (cx, cy, sweep, from, to, r) => {
  const [x1, y1] = polar(cx, cy, sweep, from, r), [x2, y2] = polar(cx, cy, sweep, to, r);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${(to - from) * sweep > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};

const PRINT = '#f1ddb0', PRINT_DIM = '#b59f78', SEG_OFF = '#3b2914', SEG_BEYOND = '#5c2412', NEEDLE = '#f4a44b';
const SCALE = 0.209;

function needle(parent, cx, cy, length, hub, color, angle) {
  const g = node('g', { transform: `rotate(${angle} ${cx} ${cy})` }, parent);
  node('path', { d: `M${cx - hub * 0.28} ${cy}L${cx} ${cy - length}L${cx + hub * 0.28} ${cy}Z`, fill: color }, g);
  node('circle', { cx, cy, r: hub, fill: SEG_OFF, stroke: PRINT_DIM, 'stroke-width': 0.6 }, parent);
  return g;
}

function dialTick(svg, cx, cy, sweep, v) {
  const major = v % 50 === 0, [x1, y1] = polar(cx, cy, sweep, v / 100, 301 * SCALE - (major ? 23 : 11) * SCALE), [x2, y2] = polar(cx, cy, sweep, v / 100, 301 * SCALE);
  node('line', { x1, y1, x2, y2, stroke: major ? PRINT : PRINT_DIM, 'stroke-width': (major ? 7 : 4) * SCALE }, svg);
}

function speedDial(api, live) {
  const box = [6, 611.1, 158, 763.1], cx = 82, cy = 687.1, sweep = 230;
  const svg = svgZone(api, 'dial', box);
  for (let i = 0; i < 30; i++) node('path', { d: arc(cx, cy, sweep, i / 30 + 0.004, (i + 0.78) / 30, 248 * SCALE), fill: 'none', stroke: i >= 24 ? SEG_BEYOND : SEG_OFF, 'stroke-width': 31 * SCALE }, svg);
  for (let v = 0; v <= 100; v += 10) dialTick(svg, cx, cy, sweep, v);
  const texts = live.items.filter((i) => i.cls.includes('dial-number'));
  const label = (item, x, y) => {
    const t = node('text', { x, y, fill: PRINT, stroke: PRINT, 'font-size': 12, 'letter-spacing': 0.24 }, svg);
    t.textContent = item.text;
  };
  texts.forEach((item) => label(item, item.box[0] + item.box[2] / 2, item.box[1] + item.box[3] / 2));
  const unit = live.items.find((i) => i.cls.includes('dial-unit'));
  const u = node('text', { x: unit.box[0] + unit.box[2] / 2, y: unit.box[1] + unit.box[3] / 2, fill: PRINT, stroke: PRINT, 'font-size': 12, 'letter-spacing': 0.24 }, svg);
  u.textContent = unit.text.toUpperCase();
  const angle = (0 - 0.5) * sweep;
  needle(svg, cx, cy, 148 * SCALE, 23 * SCALE, NEEDLE, angle);
}

const GLASS = { fuel: [154.85, 621.25, 210.45, 660.35], heat: [216.35, 621.25, 271.65, 660.35] };
const ARC = { reach: 0.43, rise: 0.16, stroke: 0.143, needle: 1.14, hub: 0.116, gap: 0.3 };

function arcGauge(api, name, tone, lowItem, highItem, share) {
  const box = GLASS[name], w = box[2] - box[0], h = box[3] - box[1];
  const svg = svgZone(api, name, box), cx = box[0] + w / 2, cy = box[3] - h * ARC.rise, sweep = 100, r = w * ARC.reach;
  for (let i = 0; i < 6; i++) {
    const hot = tone === 'fuel' ? i === 0 : i >= 4, color = hot ? '#ef4f3a' : tone === 'fuel' ? '#74d39c' : '#f2a33a';
    node('path', { d: arc(cx, cy, sweep, i / 6 + 0.01, (i + 0.84) / 6, r), fill: 'none', stroke: color, 'stroke-width': r * ARC.stroke }, svg);
  }
  [lowItem, highItem].forEach((item, i) => {
    const a = ((i - 0.5) * sweep * Math.PI) / 180;
    const t = node('text', { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) + r * ARC.gap, fill: item.color, stroke: item.color, 'font-size': 10, 'letter-spacing': 0.2 }, svg);
    t.textContent = item.text;
  });
  needle(svg, cx, cy, r * ARC.needle, r * ARC.hub, PRINT, (share - 0.5) * sweep);
}

function glassGloss(api) {
  const gloss = api.zone('dial', 'd-gloss');
  Object.assign(gloss.style, {
    borderRadius: '50%', pointerEvents: 'none',
    background: 'radial-gradient(ellipse 62% 42% at 38% 24%, rgba(255,240,215,.144), rgba(255,240,215,.042) 55%, rgba(255,240,215,0) 72%), radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 62%, rgba(255,235,200,.042) 66%, rgba(0,0,0,0) 70%)',
  });
  return gloss;
}

export default function driveOverlay(api) {
  const live = api.live, item = (text) => live.items.find((i) => i.text === text);
  speedDial(api, live);
  const gloss = glassGloss(api);
  queueMicrotask(() => gloss.parentElement.append(gloss));
  const ends = live.items.filter((i) => i.cls.includes('arc-end'));
  arcGauge(api, 'fuel', 'fuel', ends[0], ends[1], 0.22);
  arcGauge(api, 'heat', 'heat', ends[2], ends[3], 0);

  const cool = item('Cool engine');
  const coolKey = api.sprite('cool');
  const text = api.zone('coolText', 'd-cool');
  text.textContent = cool.text;
  Object.assign(text.style, { font: cool.font.replace(/[\d.]+px/, css(10)), color: cool.color, letterSpacing: css(0.2), lineHeight: '1.05', alignContent: 'center' });
  const hit = api.zone('coolHit', 'hit', 'button');
  const move = api.follow(text, 'coolText', 'coolTextDown');
  hit.onpointerdown = () => { coolKey.show(1); move(true); };
  hit.onpointerup = hit.onpointerleave = () => { coolKey.show(0); move(false); };

  for (const name of ['Manual', 'Lights', 'Overdrive']) {
    const it = item(name), z = api.zone(name.toLowerCase(), 'd-label');
    z.textContent = it.text;
    Object.assign(z.style, { font: it.font.replace(/[\d.]+px/, css(10)), color: 'rgb(228, 209, 165)', letterSpacing: 'normal', lineHeight: css(15.3) });
  }
  api.zone('heatLamp', 'd-lamp red').classList.add('lit');
  [0, 1, 2].forEach((i) => {
    const rocker = api.sprite(`rocker${i}`);
    const rhit = api.zone(`rockerHit${i}`, 'hit', 'button');
    for (const word of ['on', 'off']) {
      const z = api.zone(`${word}${i}`, 'd-label');
      z.textContent = word.toUpperCase();
      Object.assign(z.style, { font: `400 ${css(10)} "Routed Gothic Narrow"`, color: 'rgb(228, 209, 165)', letterSpacing: 'normal', lineHeight: css(15.3) });
    }
    const lamp = api.zone(`lamp${i}`, 'd-lamp');
    let on = false;
    rhit.onclick = () => { on = !on; rocker.show(on ? 1 : 0); lamp.classList.toggle('lit', on); };
  });
}
