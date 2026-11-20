import { HUD, INTERFACE, PARTS } from './parts.js';

const VIEW = new URLSearchParams(location.search).get('view') ?? 'desktop';
const V = Date.now();
const fetchJson = async (url) => { const r = await fetch(`${url}?v=${V}`, { cache: 'no-store' }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };

function pivot(M, c) {
  let p = c;
  for (let r = c + 1; r < M.length; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
  [M[c], M[p]] = [M[p], M[c]];
}
function eliminate(M, c) {
  const n = M.length;
  for (let r = 0; r < n; r++) {
    if (r === c) continue;
    const f = M[r][c] / M[c][c];
    for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
  }
}
function solve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) { pivot(M, c); eliminate(M, c); }
  return M.map((row, i) => row[n] / row[i]);
}
export function warp(w, h, q) {
  const src = [[0, 0], [w, 0], [w, h], [0, h]], A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [X, Y] = q[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
  }
  const m = solve(A, b);
  return `matrix3d(${m[0]},${m[3]},0,${m[6]},${m[1]},${m[4]},0,${m[7]},0,0,1,0,${m[2]},${m[5]},0,1)`;
}

const boxes = await fetchJson('boxes.json');
const live = await fetchJson('live.json');
const baked = {}, broken = {};
for (const name of PARTS) {
  try { baked[name] = { meta: await fetchJson(`../../src/ui/dash/baked/${name}.${VIEW}.json`), overlay: (await import(`./parts/${name}.overlay.js?v=${V}`)).default }; }
  catch (e) { broken[name] = e; console.error(`${name}: ${e.stack || e}`); }
}
const failBox = (name, e) => {
  const d = document.createElement('div');
  const [x, y, w, h] = boxes.faces[name];
  Object.assign(d.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, background: '#a00c', color: '#fff', font: '12px monospace', overflow: 'hidden', whiteSpace: 'pre-wrap' });
  d.textContent = `${name} failed: ${e.stack || e}`;
  return d;
};

function buildPart(name) {
  const { meta, overlay } = baked[name];
  const [fx, fy, fw] = boxes.faces[name];
  const f = meta.face, scale = fw / Math.hypot(f[1][0] - f[0][0], f[1][1] - f[0][1]);
  const wrap = document.createElement('div');
  wrap.className = `part part-${name}`;
  wrap.style.left = `${fx - f[0][0] * scale}px`; wrap.style.top = `${fy - f[0][1] * scale}px`;
  wrap.style.width = `${meta.width * scale}px`; wrap.style.height = `${meta.height * scale}px`;
  const root = document.createElement('div');
  root.className = 'radio-root';
  root.style.width = `${meta.width}px`; root.style.height = `${meta.height}px`;
  root.style.transform = `scale(${scale})`;
  wrap.append(root);
  const pic = (file) => `../../public/hud/baked/${name}/${VIEW}/${file}@${Math.max(...meta.scales)}x.webp?v=${V}`;
  const layer = (file, [x0, y0, x1]) => {
    const i = document.createElement('img'); i.className = 'layer'; i.draggable = false; i.src = pic(file);
    i.style.left = `${x0}px`; i.style.top = `${y0}px`; i.style.width = `${x1 - x0}px`;
    root.append(i); return i;
  };
  const housing = layer('housing', [0, 0, meta.width]);
  const left = fx - f[0][0] * scale, top = fy - f[0][1] * scale;
  const api = {
    root, meta, scale, pic, housing, live: live[name],
    toPlate: (sx, sy) => [(sx - left) / scale, (sy - top) / scale],
    zone(zoneName, cls = '', tag = 'div') {
      const z = meta.zones[zoneName];
      if (!z) throw new Error(`${name}: no zone ${zoneName}`);
      const d = document.createElement(tag);
      d.className = `zone ${cls}`.trim();
      d.style.width = `${z.size[0]}px`; d.style.height = `${z.size[1]}px`;
      d.style.transform = warp(z.size[0], z.size[1], z.quad);
      root.append(d); return d;
    },
    follow(el, upName, downName) {
      const z = meta.zones[upName], d = meta.zones[downName];
      if (!z || !d) throw new Error(`${name}: follow needs zones ${upName} and ${downName}`);
      const upT = warp(z.size[0], z.size[1], z.quad), downT = warp(d.size[0], d.size[1], d.quad);
      return (down) => { el.style.transform = down ? downT : upT; };
    },
    sprite(spriteName, frame = 0) {
      const s = meta.sprites[spriteName];
      if (!s) throw new Error(`${name}: no sprite ${spriteName}`);
      const img = layer(s.frames[frame], s.crop);
      return { img, show: (i) => { img.src = pic(s.frames[i]); }, frames: s.frames.length };
    },
  };
  overlay(api);
  return wrap;
}

const CAST = { reach: 10, floor: 9 - 3, contact: 2, shade: 'rgb(20 8 2 / 0.45)' };
const CASTERS = ['weapons', 'radio'];
function deviceCast(name) {
  const [x, y, w, h] = boxes.faces[name];
  const bottom = y + h;
  const pts = [[x, bottom + CAST.contact], [x + w, bottom + CAST.contact], [x + w + CAST.reach, bottom - CAST.floor], [x + CAST.reach, bottom - CAST.floor]];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'cast'); svg.setAttribute('viewBox', '0 0 1280 720');
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', pts.map((p) => p.join(',')).join(' ')); poly.setAttribute('fill', CAST.shade);
  svg.append(poly);
  return svg;
}
const castFor = (name, names) => (CASTERS.includes(name) && names.includes('rail') ? [deviceCast(name)] : []);
function partNodes(name, names) {
  if (broken[name]) return [failBox(name, broken[name])];
  if (!baked[name]) return [];
  try { return [buildPart(name), ...castFor(name, names)]; }
  catch (e) { console.error(`${name}: ${e.stack || e}`); return [failBox(name, e)]; }
}
function bakedScene(names = HUD, background = 'clean.png') {
  const scene = document.createElement('div');
  scene.className = 'scene';
  scene.style.backgroundImage = `url("${background}")`;
  for (const name of names) scene.append(...partNodes(name, names));
  return scene;
}

document.getElementById('full').replaceWith(Object.assign(bakedScene(), { id: 'full' }));

const windowOf = (content, { x, y, width, height }, fullW) => {
  const ZOOM = width * 2 > 1280 ? 1 : 2;
  const w = document.createElement('div');
  w.className = 'window';
  w.style.width = `${width * ZOOM}px`; w.style.height = `${height * ZOOM}px`;
  content.style.transform = `scale(${ZOOM}) translate(${-x}px, ${-y}px)`;
  if (fullW) content.style.width = `${fullW}px`;
  w.append(content);
  return w;
};
const rows = document.getElementById('rows');
for (const name of PARTS) {
  const crop = boxes.crops[name];
  if (name === INTERFACE[0]) { const h2 = document.createElement('h2'); h2.textContent = 'Interface parts side by side at 2x'; rows.append(h2); }
  const h = document.createElement('h3'); h.textContent = name; rows.append(h);
  const pair = document.createElement('div'); pair.className = 'pair';
  const sceneOf = boxes.scenes?.[name];
  const img = document.createElement('img'); img.src = sceneOf ? sceneOf.current : 'current.png';
  const left = document.createElement('figure'); left.append(windowOf(img, crop, 1280), Object.assign(document.createElement('figcaption'), { textContent: 'Current' }));
  const right = document.createElement('figure');
  if (baked[name]) right.append(windowOf(sceneOf ? bakedScene([name], sceneOf.clean) : bakedScene(), crop), Object.assign(document.createElement('figcaption'), { textContent: 'Baked 3D' }));
  else right.append(Object.assign(document.createElement('figcaption'), { textContent: 'Not baked yet' }));
  pair.append(left, right); rows.append(pair);
}
document.body.dataset.ready = '1';
