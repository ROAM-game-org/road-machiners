const K = 3.2;
const ORIGIN = [360, 112];
const px = (v) => `${v * K}px`;
const style = document.createElement('style');
style.textContent = `
@font-face { font-family: "Routed Gothic Narrow"; src: url("/game/src/ui/fonts/routed-gothic-narrow.woff2") format("woff2"); }
.part-tip .t-content { position: absolute; }
.part-tip .t-content > * { position: absolute; margin: 0; white-space: nowrap; line-height: normal; }
.part-tip .t-title { font: 400 ${px(12)} "Routed Gothic Narrow", sans-serif; letter-spacing: ${px(0.48)}; text-transform: uppercase; color: rgb(36, 28, 20); text-shadow: 0 1px 0 rgba(255,240,205,.22); }
.part-tip .t-line { font: 500 ${px(12)} "Chakra Petch", sans-serif; letter-spacing: ${px(0.24)}; color: rgb(255, 181, 71); text-shadow: 0 0 ${px(4)} rgba(255, 140, 26, 0.22); }
.part-tip .t-line.dim { color: rgb(217, 163, 90); }
.part-tip .t-icon { width: ${px(13.6)}; height: ${px(13.6)}; fill: #e0cda2; }
.part-tip .t-icon svg { width: 100%; height: 100%; display: block; fill: inherit; }
`;
document.head.append(style);

export default function tipOverlay(api) {
  const { items } = api.live;
  const find = (cls) => { const hit = items.filter((i) => i.cls.split(' ').includes(cls)); if (!hit.length) throw new Error(`tip: no ${cls} in live.json`); return hit; };
  const [title] = find('hud-panel-title');
  const lines = find('screen-line');
  const close = api.sprite('close');
  const content = api.zone('content', 't-content');
  const place = (el, x, y) => { el.style.left = px(x - ORIGIN[0]); el.style.top = px(y - ORIGIN[1]); content.append(el); return el; };
  const t = document.createElement('div'); t.className = 't-title'; t.textContent = title.text; place(t, title.box[0], title.box[1]);
  for (const l of lines) { const d = document.createElement('div'); d.className = `t-line${l.cls.includes('dim') ? ' dim' : ''}`; d.textContent = l.text; place(d, l.box[0], l.box[1]); }
  const hit = api.zone('hit', 'hit', 'button');
  const press = (down) => { close.show(down ? 1 : 0); };
  hit.onpointerdown = () => press(true);
  hit.onpointerup = hit.onpointerleave = () => press(false);
  content.parentElement.append(content);
  hit.parentElement.append(hit);
}
