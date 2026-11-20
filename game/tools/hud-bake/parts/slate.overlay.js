let K = 4;
const css = (v) => `${v * K}px`;
export const setScale = (api) => { K = api.meta.k ?? 4; };

const style = document.createElement('style');
style.textContent = `
@font-face { font-family: "Barlow Semi Condensed"; font-weight: 400; src: url("/game/node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-400-normal.woff2") format("woff2"); }
@font-face { font-family: "IBM Plex Mono"; font-weight: 400; src: url("/game/node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2") format("woff2"); }
.part-journal .s-text, .part-dialog .s-text { white-space: nowrap; overflow: visible; }
.part-journal button.hit, .part-dialog button.hit { background: none; border: 0; padding: 0; cursor: pointer; }
.part-journal .s-icon svg { width: 100%; height: 100%; display: block; fill: currentColor; }
`;
document.head.append(style);

export const textStyle = (el, item, lineH) => {
  Object.assign(el.style, { font: item.font.replace(/[\d.]+px/, css(parseFloat(item.font.match(/([\d.]+)px/)[1]))), color: item.color, lineHeight: css(lineH ?? item.box[3]) });
  el.textContent = item.text;
};

export function closeKey(api, label) {
  setScale(api);
  const key = api.sprite('close');
  const text = api.zone('closeText', 's-text');
  textStyle(text, label);
  const hit = api.zone('closeHit', 'hit', 'button');
  const move = api.follow(text, 'closeText', 'closeTextDown');
  hit.onpointerdown = () => { key.show(1); move(true); };
  hit.onpointerup = hit.onpointerleave = () => { key.show(0); move(false); };
}
