import { bindAttr, boundMsg, TEXT_ATTRS, textNode, type TextAttr } from '../text/language';
import { Msg, VERBATIM, type DevLocale } from '../text/msg';

type TextAttrs = { [K in TextAttr]?: Msg };
type Attrs = TextAttrs & Record<string, string | number | boolean | Msg | ((e: Event) => void) | undefined>;
export type Child = Node | Msg | null;

export function el(tag: string, attrs: Attrs = {}, ...children: Child[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) setAttr(node, k, v);
  for (const c of children) if (c !== null) node.append(Msg.is(c) ? textNode(c) : c);
  return node;
}

export function devEl(tag: string, attrs: Record<string, string | number | boolean | ((e: Event) => void) | undefined> = {}, ...children: (Node | string | null)[]): HTMLElement {
  const node = el(tag, attrs);
  for (const c of children) if (c !== null) node.append(c);
  return node;
}

function setAttr(node: HTMLElement, k: string, v: Attrs[string]): void {
  if (v === undefined || v === false) return;
  if (Msg.is(v)) return bindText(node, k, v);
  if (typeof v === 'function') return node.addEventListener(k.replace(/^on/, '').toLowerCase(), v);
  setPlainAttr(node, k, v);
}

function setPlainAttr(node: HTMLElement, k: string, v: string | number | true): void {
  if (k === 'class') node.className = String(v);
  else if (v === true) node.setAttribute(k, '');
  else node.setAttribute(k, String(v));
}

export function uiRoot(): HTMLElement {
  const root = document.getElementById('ui');
  if (!root) throw new Error('#ui element missing from index.html');
  return root;
}

export function topLeft(): HTMLElement {
  const root = uiRoot();
  const found = root.querySelector<HTMLElement>(':scope > .top-left');
  if (found) return found;
  const row = el('div', { class: 'top-left' });
  root.append(row);
  return row;
}

export function bottomLeft(): HTMLElement {
  const root = uiRoot();
  const found = root.querySelector<HTMLElement>(':scope > .bottom-left');
  if (found) return found;
  const row = el('div', { class: 'bottom-left' });
  root.append(row);
  return row;
}

export function topRight(): HTMLElement {
  const root = uiRoot();
  const found = root.querySelector<HTMLElement>(':scope > .top-right');
  if (found) return found;
  const row = el('div', { class: 'top-right' });
  root.append(row);
  return row;
}

export function rightColumn(): HTMLElement {
  const root = uiRoot();
  const found = root.querySelector<HTMLElement>(':scope > .right-column');
  if (found) return found;
  const column = el('div', { class: 'right-column' });
  root.append(column);
  return column;
}

export function rightDock(): HTMLElement {
  const column = rightColumn();
  const found = column.querySelector<HTMLElement>(':scope > .right-dock');
  if (found) return found;
  const dock = el('div', { class: 'right-dock', 'data-drawer-frame': 'radio' });
  column.append(dock);
  return dock;
}

export function panel(cls: string, parent: HTMLElement = uiRoot()): HTMLElement {
  const p = el('div', { class: `panel ${cls}` });
  p.addEventListener('pointerdown', (e) => e.stopPropagation());
  p.addEventListener('wheel', (e) => e.stopPropagation());
  parent.append(p);
  return p;
}

export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = el('a', { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url));
}

export function isBrowserChord(e: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey">): boolean {
  return e.ctrlKey || e.metaKey || e.altKey;
}

export function topCenter(): HTMLElement {
  const root = uiRoot();
  const found = root.querySelector<HTMLElement>(':scope > .top-center');
  if (found) return found;
  const stack = el('div', { class: 'top-center' });
  root.append(stack);
  return stack;
}

type ClickAttrs = { onclick: () => void; 'aria-disabled'?: string; 'data-reason'?: Msg };

export function disabledWith(reason: Msg | null, onclick: () => void): ClickAttrs {
  if (reason === null) return { onclick };
  return { onclick: () => {}, 'aria-disabled': 'true', 'data-reason': reason };
}

function bindText(node: HTMLElement, k: string, msg: Msg): void {
  const attr = TEXT_ATTRS.find((a) => a === k);
  if (!attr) throw new Error(`Attribute "${k}" does not take text`);
  bindAttr(node, attr, msg);
}

export type LayoutFaultKind = "page-overflow" | "clipped-text" | "text-escapes" | "control-overlap" | "unreachable-control" | "missing-glyphs" | "leak" | "sideways-overflow" | "covered-control" | "small-target";
export type LayoutFault = { kind: LayoutFaultKind; path: string; text: string; sizes: string };
export type LayoutOptions = { locale: DevLocale; allow: readonly string[]; glyphs: { font: string; letter: string } };

const SLACK_PX = 1;
const CONTROLS = "button, a[href], input, select, textarea, [role=button]";
const LATIN_WORD = /[A-Za-z]{2,}/;

export function clipped(box: { clientWidth: number; clientHeight: number; scrollWidth: number; scrollHeight: number }, clips: { x: boolean; y: boolean }): boolean {
  const wide = clips.x && box.scrollWidth > box.clientWidth + SLACK_PX;
  const tall = clips.y && box.scrollHeight > box.clientHeight + SLACK_PX;
  return wide || tall;
}

export function sidewaysOverflow(box: { scrollWidth: number; clientWidth: number }): boolean {
  return box.scrollWidth > box.clientWidth + SLACK_PX;
}

export function coveredControl(hit: Element | null, control: Element): boolean {
  return hit === null || !(hit === control || control.contains(hit));
}

export function smallTarget(box: Box, min: number): boolean {
  if (box.right <= box.left || box.bottom <= box.top) return false;
  return box.right - box.left < min - SLACK_PX || box.bottom - box.top < min - SLACK_PX;
}

export function outsideViewport(box: Box, viewport: { width: number }): boolean {
  if (box.right <= box.left) return false;
  return box.left < -SLACK_PX || box.right > viewport.width + SLACK_PX;
}

export function escapes(text: Box, clip: Box): boolean {
  if (text.right <= text.left || text.bottom <= text.top) return false;
  return text.left < clip.left - SLACK_PX || text.top < clip.top - SLACK_PX || text.right > clip.right + SLACK_PX || text.bottom > clip.bottom + SLACK_PX;
}

export type Box = { left: number; top: number; right: number; bottom: number };

const isEmpty = (b: Box): boolean => b.right <= b.left || b.bottom <= b.top;

export function overlaps(a: Box, b: Box): boolean {
  if (isEmpty(a) || isEmpty(b)) return false;
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export function intersect(a: Box, b: Box): Box {
  return { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
}

export function pairOverlaps(boxes: readonly Box[]): [number, number][] {
  const pairs: [number, number][] = [];
  boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b, k) => {
    if (overlaps(a, b)) pairs.push([i, i + 1 + k]);
  }));
  return pairs;
}

export function latinLeft(text: string, allow: readonly string[]): boolean {
  const rest = allow.reduce((left, word) => left.split(word).join(" "), text);
  return LATIN_WORD.test(rest);
}

function isShown(el: Element): boolean {
  if (el.getClientRects().length === 0 || el.closest("details:not([open]) > :not(summary), [aria-hidden=true]")) return false;
  const style = getComputedStyle(el);
  const srOnly = style.clipPath === "inset(50%)";
  return !srOnly && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0;
}

export function cssPath(el: Element): string {
  const parts: string[] = [];
  for (let node: Element | null = el; node && node.id !== "ui" && parts.length < 5; node = node.parentElement) {
    const cls = [...node.classList].slice(0, 2).map((c) => `.${c}`).join("");
    parts.unshift(`${node.tagName.toLowerCase()}${cls}`);
  }
  return parts.join(" > ");
}

const sizeOf = (r: Box): string => `${Math.round(r.right - r.left)}x${Math.round(r.bottom - r.top)} at ${Math.round(r.left)},${Math.round(r.top)}`;

function clipsOf(el: Element): { x: boolean; y: boolean } {
  const style = getComputedStyle(el);
  const clips = (v: string) => v === "hidden" || v === "clip";
  return { x: clips(style.overflowX), y: clips(style.overflowY) };
}

function ellipsisWithTitle(el: Element): boolean {
  return getComputedStyle(el).textOverflow === "ellipsis" && el.closest("[title]") !== null;
}

function ownText(el: Element): string {
  return [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? "").join("").trim();
}

function clippedTextFaults(root: Element): LayoutFault[] {
  return [...root.querySelectorAll("*")].flatMap((el) => {
    const text = ownText(el);
    if (!text || !isShown(el) || !clipped(el, clipsOf(el)) || ellipsisWithTitle(el)) return [];
    return [{ kind: "clipped-text", path: cssPath(el), text, sizes: `client ${el.clientWidth}x${el.clientHeight}, scroll ${el.scrollWidth}x${el.scrollHeight}` }];
  });
}

const scrolls = (v: string) => v === "auto" || v === "scroll";

function clipBox(el: Element): Box | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (scrolls(style.overflowX) || scrolls(style.overflowY)) return null;
    const clips = clipsOf(node);
    if (clips.x || clips.y) return node.getBoundingClientRect();
  }
  return null;
}

function textNodes(root: Element): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent?.trim() && n.parentElement && isShown(n.parentElement)) nodes.push(n as Text);
  return nodes;
}

function rangeBox(node: Text): Box {
  const range = document.createRange();
  range.selectNodeContents(node);
  return range.getBoundingClientRect();
}

function escapeFaults(root: Element): LayoutFault[] {
  return textNodes(root).flatMap((node) => {
    const clip = clipBox(node.parentElement!);
    const box = rangeBox(node);
    if (!clip || !escapes(box, clip)) return [];
    return [{ kind: "text-escapes", path: cssPath(node.parentElement!), text: node.textContent!.trim(), sizes: `text ${sizeOf(box)}, clip ${sizeOf(clip)}` }];
  });
}

function controls(root: Element): HTMLElement[] {
  const modal = [...root.querySelectorAll(".modal")].find(isShown);
  return [...(modal ?? root).querySelectorAll<HTMLElement>(CONTROLS)].filter(isShown);
}

function scrolledBox(el: Element): Box {
  let box: Box = el.getBoundingClientRect();
  for (let node = el.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (scrolls(style.overflowX) || scrolls(style.overflowY)) box = intersect(box, node.getBoundingClientRect());
  }
  return box;
}

function overlapFaults(root: Element): LayoutFault[] {
  const list = controls(root);
  const boxes = list.map(scrolledBox);
  return pairOverlaps(boxes)
    .filter(([a, b]) => !list[a].contains(list[b]) && !list[b].contains(list[a]))
    .map(([a, b]) => ({ kind: "control-overlap", path: `${cssPath(list[a])} | ${cssPath(list[b])}`, text: `${list[a].innerText} | ${list[b].innerText}`.trim(), sizes: `${sizeOf(boxes[a])} | ${sizeOf(boxes[b])}` }));
}

function reachFault(el: HTMLElement): LayoutFault[] {
  if ((el as HTMLButtonElement).disabled) return [];
  el.scrollIntoView({ block: "center", inline: "center" });
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
  if (hit && (hit === el || el.contains(hit))) return [];
  return [{ kind: "unreachable-control", path: cssPath(el), text: el.innerText.trim(), sizes: `${sizeOf(r)}, hit ${hit ? cssPath(hit) : "nothing"}` }];
}

function reachFaults(root: Element): LayoutFault[] {
  const boxes = [...root.querySelectorAll("*")].filter((el) => el.scrollTop > 0 || el.scrollLeft > 0 || el.scrollHeight > el.clientHeight);
  const kept = boxes.map((el) => [el.scrollTop, el.scrollLeft] as const);
  const faults = controls(root).flatMap(reachFault);
  boxes.forEach((el, i) => el.scrollTo(kept[i][1], kept[i][0]));
  return faults;
}

function pageFaults(opts: LayoutOptions): LayoutFault[] {
  const faults: LayoutFault[] = [];
  const page = document.documentElement;
  const { font, letter } = opts.glyphs;
  if (page.scrollWidth > window.innerWidth) faults.push({ kind: "page-overflow", path: "html", text: "", sizes: `scroll ${page.scrollWidth}, window ${window.innerWidth}` });
  if (opts.locale === "ru" && !document.fonts.check(`14px "${font}"`, letter)) faults.push({ kind: "missing-glyphs", path: "html", text: letter, sizes: font });
  return faults;
}

function leakFaults(root: Element, allow: readonly string[]): LayoutFault[] {
  return textNodes(root).flatMap((node) => {
    if (boundMsg(node)?.key === VERBATIM || !latinLeft(node.textContent!, allow)) return [];
    return [{ kind: "leak", path: cssPath(node.parentElement!), text: node.textContent!.trim(), sizes: "" }];
  });
}

export function findLayoutFaults(root: Element, opts: LayoutOptions): LayoutFault[] {
  return [
    ...pageFaults(opts),
    ...clippedTextFaults(root),
    ...escapeFaults(root),
    ...overlapFaults(root),
    ...reachFaults(root),
    ...(opts.locale === "ru" ? leakFaults(root, opts.allow) : []),
  ];
}

export type MobileOptions = { viewportWidth: number; primary: readonly string[]; minTarget: number; sidewaysOk: readonly string[]; smallOk: readonly string[] };

function hasClippingAncestor(el: Element): boolean {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    if (getComputedStyle(node).overflowX !== "visible") return true;
  }
  return false;
}

function scrollerFaults(root: Element, okSelectors: readonly string[]): LayoutFault[] {
  return [...root.querySelectorAll("*")].flatMap((el) => {
    if (!scrolls(getComputedStyle(el).overflowX) || !isShown(el) || !sidewaysOverflow(el)) return [];
    if (okSelectors.some((selector) => el.matches(selector))) return [];
    return [{ kind: "sideways-overflow", path: cssPath(el), text: "", sizes: `client ${el.clientWidth}, scroll ${el.scrollWidth}` }];
  });
}

function offscreenFaults(root: Element, viewportWidth: number, okSelectors: readonly string[]): LayoutFault[] {
  const viewport = { width: viewportWidth };
  return [...root.querySelectorAll("*")].flatMap((el) => {
    if (!isShown(el) || hasClippingAncestor(el) || okSelectors.some((selector) => el.matches(selector))) return [];
    const box = el.getBoundingClientRect();
    if (!outsideViewport(box, viewport)) return [];
    return [{ kind: "sideways-overflow", path: cssPath(el), text: "", sizes: `${sizeOf(box)}, window ${viewport.width}` }];
  });
}

function sidewaysFaults(root: Element, viewportWidth: number, okSelectors: readonly string[]): LayoutFault[] {
  const page = document.documentElement;
  const faults = sidewaysOverflow({ scrollWidth: page.scrollWidth, clientWidth: viewportWidth }) ? [{ kind: "sideways-overflow" as const, path: "html", text: "", sizes: `scroll ${page.scrollWidth}, device ${viewportWidth}` }] : [];
  return [...faults, ...scrollerFaults(root, okSelectors), ...offscreenFaults(root, viewportWidth, okSelectors)];
}

function coveredFaults(root: Element, primary: readonly string[]): LayoutFault[] {
  return primary.flatMap((selector) =>
    [...root.querySelectorAll<HTMLElement>(selector)].filter(isShown).flatMap((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      if (!coveredControl(hit, el)) return [];
      return [{ kind: "covered-control" as const, path: cssPath(el), text: el.innerText.trim(), sizes: `${sizeOf(r)}, hit ${hit ? cssPath(hit) : "nothing"}` }];
    }),
  );
}

function smallFaults(root: Element, min: number, okSelectors: readonly string[]): LayoutFault[] {
  return controls(root)
    .filter((el) => !(el as HTMLButtonElement).disabled && !okSelectors.some((selector) => el.matches(selector)))
    .flatMap((el) => {
      const box = el.getBoundingClientRect();
      if (!smallTarget(box, min)) return [];
      return [{ kind: "small-target" as const, path: cssPath(el), text: el.innerText.trim(), sizes: sizeOf(box) }];
    });
}

export function findMobileFaults(root: Element, opts: MobileOptions): LayoutFault[] {
  return [...sidewaysFaults(root, opts.viewportWidth, opts.sidewaysOk), ...coveredFaults(root, opts.primary), ...smallFaults(root, opts.minTarget, opts.smallOk)];
}
