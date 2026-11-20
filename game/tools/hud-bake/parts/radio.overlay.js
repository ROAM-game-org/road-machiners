const K = 1279 / 412;
const px = (cssPx) => `${cssPx * K}px`;

const style = document.createElement('style');
style.textContent = `
.part-radio .r-text { color: #ffb547; text-shadow: 0 0 ${px(4)} #ff8c1a38; font-family: "Chakra Petch", sans-serif; font-weight: 500; font-size: ${px(12)}; line-height: 1.25; }
.part-radio .r-talk { padding: ${px(1.6 * 4.12)} ${px(2.4 * 4.12)}; letter-spacing: 0.04em; text-transform: uppercase; }
.part-radio .r-talk .band { display: flex; justify-content: space-between; font-weight: 700; }
.part-radio .r-log { padding: ${px(1.4 * 4.12)} ${px(2.4 * 4.12)}; letter-spacing: 0.02em; overflow-y: auto; scrollbar-width: none; }
.part-radio .r-log > div { padding: ${px(0.3 * 4.12)} 0; }
.part-radio .r-log .t { color: #b59f78; margin-right: ${px(8)}; }
.part-radio .r-lcd-fields .field { position: absolute; display: block; line-height: 1; text-align: right; white-space: nowrap; font-family: "TC Calculator Digits", monospace; color: #ffb547; text-shadow: 0 0 ${px(4)} #ff8c1a38; }
.part-radio .r-lcd-fields .colon { text-align: center; }
.part-radio .r-lcd-fields .seg { z-index: 0; }
.part-radio .r-lcd-fields .seg::before { content: attr(data-ghost); position: absolute; right: 0; top: 0; z-index: -1; color: #4a2d12; text-shadow: none; }
.part-radio .r-lcd { display: flex; align-items: center; justify-content: center; gap: ${px(6)}; font-family: "TC Calculator Digits", monospace; font-size: ${px(24)}; color: #ffb547; text-shadow: 0 0 ${px(4)} #ff8c1a38; }
.part-radio .r-lcd .seg { position: relative; display: inline-block; min-width: calc(var(--cells) * 1ch); text-align: right; }
.part-radio .r-lcd .seg::before { content: attr(data-ghost); position: absolute; right: 0; color: #ffb5471c; text-shadow: none; }
.part-radio .r-lcd .time { display: flex; margin-left: ${px(12)}; }
.part-radio .r-marks button { position: absolute; translate: -50% -50%; background: none; border: 0; padding: 0; cursor: pointer; font: 700 ${px(12)}/1 "Chakra Petch", sans-serif; color: #e4d1a5; }
.part-radio .r-marks button.on { color: #ffb547; text-shadow: 0 0 ${px(4)} #ff8c1a38; }
`;
document.head.append(style);

function logLines(items) {
  const pairs = [];
  for (let i = 3; i + 1 < items.length && /^Day \d+, /.test(items[i]); i += 2) pairs.push([items[i], items[i + 1]]);
  if (!pairs.length) throw new Error('radio: no log lines in live.json');
  return pairs;
}

function lcdField(api, item) {
  const [x0, y0] = api.toPlate(item.box[0], item.box[1]);
  const [x1, y1] = api.toPlate(item.box[0] + item.box[2], item.box[1] + item.box[3]);
  const f = document.createElement('span');
  f.className = item.ghost ? 'field seg' : 'field';
  if (item.ghost) f.dataset.ghost = item.ghost;
  Object.assign(f.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px`, fontSize: `${parseFloat(item.font.split(' ')[1]) / api.scale}px`, letterSpacing: `${parseFloat(item.spacing) / api.scale || 0}px`, textTransform: item.transform });
  f.textContent = item.text;
  return f;
}

export default function radioOverlay(api) {
  const wheel = api.sprite('wheel');
  const knob = api.sprite('knob', 1);
  const play = api.sprite('play');

  const items = api.live.items.map((i) => i.text);
  const [band, freq, talkText] = items;
  const logPairs = logLines(items);
  const talk = api.zone('talk', 'r-text r-talk');
  talk.innerHTML = `<div class="band"><span>${band}</span><span>${freq}</span></div><div>${talkText}</div>`;

  const log = api.zone('log', 'r-text r-log');
  log.innerHTML = logPairs.map(([t, m]) => `<div><span class="t">${t}</span>${m}</div>`).join('');
  let travel = 0;
  const roll = (dy) => {
    travel += dy;
    log.scrollTop += dy;
    const turn = (((travel / api.meta.wheelRibPx) % 1) + 1) % 1;
    wheel.show(Math.floor(turn * wheel.frames));
  };
  log.addEventListener('wheel', (e) => { e.preventDefault(); roll(e.deltaY); }, { passive: false });

  const lcdItems = api.live.items.filter((i) => /lcd-(word|digits)/.test(i.cls));
  if (lcdItems.length !== 4) throw new Error(`radio: expected 4 LCD fields, got ${lcdItems.length}`);
  const lcd = document.createElement('div'); lcd.className = 'r-lcd-fields'; api.root.append(lcd);
  for (const item of lcdItems) lcd.append(lcdField(api, item));
  const hour = lcdItems.find((i) => i.cls.includes('lcd-hour')), minute = lcdItems.find((i) => i.cls.includes('lcd-minute'));
  const [cx0, cy0] = api.toPlate(hour.box[0] + hour.box[2], hour.box[1]);
  const [cx1, cy1] = api.toPlate(minute.box[0], minute.box[1] + minute.box[3]);
  const colon = document.createElement('span'); colon.className = 'field colon'; colon.textContent = ':';
  Object.assign(colon.style, { left: `${cx0}px`, top: `${cy0}px`, width: `${cx1 - cx0}px`, height: `${cy1 - cy0}px`, fontSize: `${24 / api.scale}px` });
  lcd.append(colon);

  const markItems = api.live.items.filter((i) => i.cls.includes('knob-mark'));
  if (markItems.length !== 4) throw new Error(`radio: expected 4 knob marks, got ${markItems.length}`);
  const marks = document.createElement('div'); marks.className = 'r-marks'; api.root.append(marks);
  let speed = markItems.findIndex((i) => i.cls.includes('on'));
  const buttons = markItems.map((item, i) => {
    const [x, y] = api.toPlate(item.box[0] + item.box[2] / 2, item.box[1] + item.box[3] / 2);
    const b = document.createElement('button');
    b.style.left = `${x}px`; b.style.top = `${y}px`;
    b.textContent = item.text; b.onclick = () => set(i); marks.append(b); return b;
  });
  const set = (i) => { speed = i; knob.show(i); buttons.forEach((b, j) => b.classList.toggle('on', j === i)); };
  set(speed);

  const knobHit = api.zone('knob', 'hit', 'button'); knobHit.onclick = () => set((speed + 1) % 4);
  const playHit = api.zone('play', 'hit', 'button');
  playHit.onpointerdown = () => play.show(1);
  playHit.onpointerup = playHit.onpointerleave = () => play.show(0);
  const wheelHit = api.zone('wheel', 'hit', 'button');
  wheelHit.style.cursor = 'ns-resize';
  wheelHit.addEventListener('wheel', (e) => { e.preventDefault(); roll(e.deltaY); }, { passive: false });
  wheelHit.addEventListener('pointerdown', (down) => {
    if (down.isTrusted) wheelHit.setPointerCapture(down.pointerId);
    let last = down.clientY;
    const move = (e) => { roll((last - e.clientY) / api.scale); last = e.clientY; };
    wheelHit.addEventListener('pointermove', move);
    wheelHit.addEventListener('pointerup', () => wheelHit.removeEventListener('pointermove', move), { once: true });
  });
}
