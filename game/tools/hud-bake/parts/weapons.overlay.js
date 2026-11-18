const K = 3.2;
const px = (cssPx) => `${cssPx * K}px`;
const SCREEN_ORIGIN = [384, 569.5];
const ICON_URL = '/game/public/icons/items.svg';
const AMBER = '#ffb547';
const GLOW = '#ff8c1a38';

const style = document.createElement('style');
style.textContent = `
.part-weapons .w-screen { position: absolute; }
.part-weapons .w-screen > * { position: absolute; margin: 0; white-space: nowrap; color: ${AMBER}; text-shadow: 0 0 ${px(4)} ${GLOW}; font-family: "Chakra Petch", sans-serif; font-weight: 700; line-height: normal; }
.part-weapons .w-icon { filter: url(#w-amber-tint) drop-shadow(0 0 ${px(4)} ${GLOW}); }
.part-weapons .w-belt { background: repeating-linear-gradient(to right, ${AMBER} 0 ${px(1)}, transparent ${px(1)} ${px(1.8)}); }
.part-weapons .w-print { display: flex; align-items: center; justify-content: center; text-align: center; font: 400 ${px(10)} "Routed Gothic Narrow", sans-serif; text-transform: uppercase; letter-spacing: ${px(0.2)}; color: rgb(241, 221, 176); }
.part-weapons .w-print.auto { color: rgb(36, 28, 20); text-shadow: 0 1px 0 rgba(255,240,205,.22); line-height: 1.1; }
.part-weapons .w-print.all { line-height: 1.05; }
.part-weapons .w-print > span { display: block; width: min-content; margin: 0 auto; }
`;
document.head.append(style);
const faceStyle = document.createElement('style');
faceStyle.textContent = '@font-face { font-family: "Routed Gothic Narrow"; src: url("/game/src/ui/fonts/routed-gothic-narrow.woff2") format("woff2"); }';
document.head.append(faceStyle);

const tint = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
tint.setAttribute('width', '0'); tint.setAttribute('height', '0'); tint.style.position = 'absolute';
tint.innerHTML = `<filter id="w-amber-tint" color-interpolation-filters="sRGB"><feFlood flood-color="${AMBER}"/><feComposite in2="SourceAlpha" operator="in"/></filter>`;
document.body.append(tint);

const byClass = (items, cls) => {
  const hit = items.find((i) => i.cls.split(' ').includes(cls));
  if (!hit) throw new Error(`weapons: no ${cls} in live.json`);
  return hit;
};

export default function weaponsOverlay(api) {
  const rocker = api.sprite('rocker', 1);
  const key = api.sprite('key');
  const lamp = api.sprite('lamp', 1);
  const { items, icons } = api.live;

  const number = byClass(items, 'gun-number'), rounds = byClass(items, 'gun-rounds');
  const allFire = byClass(items, 'key-print'), autoFire = byClass(items, 'auto-label');
  const shape = icons.find((i) => i.tag === 'svg' && i.box[2] > 30 && i.box[2] < 60);
  if (!shape) throw new Error('weapons: no gun icon in live.json');
  const belt = { box: [459.28, 587.61, 6.39, 7.19] };

  const screen = api.zone('screen', 'w-screen');
  const at = (el, [x, y, w, h]) => {
    el.style.left = px(x - SCREEN_ORIGIN[0]); el.style.top = px(y - SCREEN_ORIGIN[1]);
    if (w !== undefined) { el.style.width = px(w); el.style.height = px(h); }
    screen.append(el); return el;
  };
  const text = (item, size) => {
    const d = document.createElement('div');
    d.textContent = item.text; d.style.fontSize = px(size);
    return at(d, item.box.slice(0, 2));
  };
  text(number, 10);
  const roundsEl = text(rounds, 12);
  roundsEl.style.minWidth = px(rounds.box[2]); roundsEl.style.textAlign = 'right';
  const icon = document.createElement('div');
  icon.className = 'w-icon';
  icon.innerHTML = '<svg viewBox="0 0 0.875 0.53125" style="width:100%;height:100%;display:block"><svg viewBox="0.046875 0.2421875 0.875 0.53125" width="0.875" height="0.53125"></svg></svg>';
  const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
  image.setAttribute('href', ICON_URL); image.setAttribute('width', '16'); image.setAttribute('height', '6'); image.setAttribute('preserveAspectRatio', 'none');
  icon.querySelector('svg svg').append(image);
  at(icon, shape.box);
  const beltEl = document.createElement('div'); beltEl.className = 'w-belt'; at(beltEl, belt.box);

  const allZone = api.zone('allText', 'w-print all');
  allZone.innerHTML = `<span>${allFire.text}</span>`;
  const allZoneDown = api.zone('allTextDown', 'w-print all');
  allZoneDown.innerHTML = `<span>${allFire.text}</span>`;
  allZoneDown.style.display = 'none';
  const autoZone = api.zone('autoText', 'w-print auto');
  autoZone.innerHTML = `<span>${autoFire.text}</span>`;

  let allOn = true, down = false;
  const showKey = () => {
    key.show((allOn ? 0 : 2) + (down ? 1 : 0));
    allZone.style.display = down ? 'none' : '';
    allZoneDown.style.display = down ? '' : 'none';
  };
  const allHit = api.zone('allHit', 'hit', 'button');
  allHit.onpointerdown = () => { down = true; showKey(); };
  allHit.onpointerup = allHit.onpointerleave = () => { if (down) { down = false; showKey(); } };
  allHit.onclick = () => { allOn = !allOn; showKey(); };

  let auto = true;
  const autoHit = api.zone('autoHit', 'hit', 'button');
  autoHit.onclick = () => { auto = !auto; rocker.show(auto ? 1 : 0); lamp.show(auto ? 1 : 0); };
}
