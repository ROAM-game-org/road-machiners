const K = 3.2;
const ORIGIN = [1001, 59];
const px = (v) => `${v * K}px`;
const style = document.createElement('style');
style.textContent = `
@font-face { font-family: "Routed Gothic Narrow"; src: url("/game/src/ui/fonts/routed-gothic-narrow.woff2") format("woff2"); }
.part-menu .m-content { position: absolute; }
.part-menu .m-content > * { position: absolute; margin: 0; white-space: nowrap; }
.part-menu .m-label { font: 400 ${px(12)} "Routed Gothic Narrow", sans-serif; letter-spacing: ${px(0.24)}; text-transform: uppercase; color: rgb(36, 28, 20); text-shadow: 0 1px 0 rgba(255,240,205,.22); line-height: normal; }
.part-menu .m-icon { width: ${px(14)}; height: ${px(14)}; fill: #e0cda2; }
.part-menu .m-icon svg { width: 100%; height: 100%; display: block; fill: inherit; }
`;
document.head.append(style);

const KEYS_X0 = Array(9).fill(1009), KEYS_Y0 = Array.from({ length: 9 }, (_, i) => 65 + 36 * i);
export default function menuOverlay(api) {
  const { items, icons } = api.live;
  const labels = items.filter((i) => i.cls.split(' ').includes('menu-label'));
  const glyphs = icons.filter((i) => i.html && i.box[2] === 14);
  if (labels.length !== api.meta.rows || glyphs.length !== api.meta.rows) throw new Error(`menu: expected ${api.meta.rows} rows, got ${labels.length} labels and ${glyphs.length} icons`);
  const content = api.zone('content', 'm-content');
  const place = (el, x, y) => { el.style.left = px(x - ORIGIN[0]); el.style.top = px(y - ORIGIN[1]); content.append(el); return el; };
  const sprites = [], iconEls = [], holders = [];
  labels.forEach((l, i) => {
    const label = document.createElement('div'); label.className = 'm-label'; label.textContent = l.text; place(label, l.box[0], l.box[1]);
    const holder = api.zone(`icon${i}`, 'm-iconzone');
    const icon = document.createElement('div'); icon.className = 'm-icon'; icon.innerHTML = glyphs[i].html;
    icon.style.position = 'absolute'; icon.style.left = px(glyphs[i].box[0] - KEYS_X0[i]); icon.style.top = px(glyphs[i].box[1] - KEYS_Y0[i]);
    holder.append(icon);
    holders.push(holder);
    iconEls.push(api.follow(holder, `icon${i}`, `icon${i}Down`));
    sprites.push(api.sprite(`key${i}`));
  });
  const lamp = api.sprite('lamp');
  let tipsOn = true;
  labels.forEach((_, i) => {
    const hit = api.zone(`hit${i}`, 'hit', 'button');
    const press = (down) => { sprites[i].show(down ? 1 : 0); iconEls[i](down); };
    hit.onpointerdown = () => press(true);
    hit.onpointerup = hit.onpointerleave = () => press(false);
    if (labels[i].text === 'Show tips') hit.onclick = () => { tipsOn = !tipsOn; lamp.show(tipsOn ? 0 : 1); };
  });
  content.parentElement.append(content);
  for (const h of holders) h.parentElement.append(h);
  for (const hit of [...api.root.querySelectorAll('button.hit')]) hit.parentElement.append(hit);
}
