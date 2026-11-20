import { textStyle, closeKey } from './slate.overlay.js';

const style = document.createElement('style');
style.textContent = `
@font-face { font-family: "Barlow Semi Condensed"; font-weight: 700; src: url("/game/node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-700-normal.woff2") format("woff2"); }
.part-dialog .d-layer { position: absolute; pointer-events: none; }
.part-dialog .d-layer > * { position: absolute; white-space: nowrap; margin: 0; }
.part-dialog .d-icon svg { width: 100%; height: 100%; display: block; fill: currentColor; }
`;
document.head.append(style);

const TRUCK_ART = [393.7, 214.7, 614.6, 645.7];
const ITEM_TILES = [633.7, 174.1, 801.7, 216.1];
const GAUGE_FILLS = [[115.3, 168, 93.1, 4], [115.3, 198, 53.2, 4]];
const FILL = 'rgb(224, 216, 202)';

export default function dialogOverlay(api) {
  const K = api.meta.k, [ox, oy] = api.meta.origin;
  const at = (el, [x, y, w, h]) => { Object.assign(el.style, { left: `${(x - ox) * K}px`, top: `${(y - oy) * K}px`, width: `${w * K}px`, height: `${h * K}px` }); return el; };
  const crop = (layer, [x0, y0, x1, y1]) => {
    const d = at(document.createElement('div'), [x0, y0, x1 - x0, y1 - y0]);
    d.style.background = `url("state-dialog.png") ${-x0 * K}px ${-y0 * K}px / ${1280 * K}px ${720 * K}px no-repeat`;
    layer.append(d);
  };
  const items = api.live.items;
  closeKey(api, items.find((i) => i.text.startsWith('Close')));
  textStyle(api.zone('title', 's-text'), items.find((i) => i.text === 'Inventory'));

  const cells = api.zone('cells', 'd-layer');
  crop(cells, ITEM_TILES);
  const wells = api.zone('wells', 'd-layer');
  crop(wells, TRUCK_ART);
  for (const item of items) {
    if (['inv-title', 'close', 'inv-item-name'].some((c) => item.cls.split(' ').includes(c))) continue;
    const t = document.createElement('div');
    textStyle(t, item);
    at(t, item.box);
    t.style.width = ''; t.style.height = '';
    t.style.font = item.font.replace(/([\d.]+)px/, (_, v) => `${v * K}px`);
    t.style.lineHeight = `${item.box[3] * K}px`;
    if (item.cls.includes('has-cause')) t.style.textDecoration = 'underline dotted';
    wells.append(t);
  }
  const grooves = api.zone('grooves', 'd-layer');
  for (const b of GAUGE_FILLS) { const f = at(document.createElement('div'), b); f.style.background = FILL; grooves.append(f); }
  for (const layer of [cells, wells, grooves]) layer.parentElement.append(layer);
  const hit = api.root.querySelector('button.hit'); hit.parentElement.append(hit);
}
