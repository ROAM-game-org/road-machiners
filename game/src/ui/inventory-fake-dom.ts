import { vi } from "vitest";

export class FakeNode {
  className = "";
  innerHTML = "";
  style: Record<string, unknown> = { setProperty: () => {}, removeProperty: () => {} };
  dataset: Record<string, string> = {};
  children: (FakeNode | string)[] = [];
  attrs = new Map<string, string>();
  isConnected = true;
  clientWidth = 400;
  offsetWidth = 400;
  offsetHeight = 300;
  clientHeight = 300;
  scrollTop = 0;
  parentElement: FakeNode | null = null;
  classList = {
    add: (c: string) => void (this.className = `${this.className} ${c}`.trim()),
    remove: (c: string) => void (this.className = this.className.split(" ").filter((x) => x !== c).join(" ")),
    toggle: (c: string, on?: boolean) => {
      const has = this.className.split(" ").includes(c);
      const want = on ?? !has;
      if (want && !has) this.classList.add(c);
      if (!want && has) this.classList.remove(c);
      return want;
    },
    contains: (c: string) => this.className.split(" ").includes(c),
  };
  constructor(readonly tag: string) {}
  append(...c: (FakeNode | string)[]) { this.children.push(...c); }
  prepend(...c: (FakeNode | string)[]) { this.children.unshift(...c); }
  replaceChildren(...c: (FakeNode | string)[]) { this.children = c; }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
  removeAttribute(k: string) { this.attrs.delete(k); }
  addEventListener() {}
  closest() { return null; }
  contains() { return false; }
  querySelectorAll(sel: string) { return sel.startsWith(".") ? this.all((n) => n !== this && n.className.split(" ").includes(sel.slice(1))) : []; }
  querySelector(sel: string) { return this.querySelectorAll(sel)[0] ?? null; }
  remove() {}
  scrollIntoView() {}
  getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) }; }
  all(pred: (n: FakeNode) => boolean): FakeNode[] {
    const here = pred(this) ? [this] : [];
    return [...here, ...this.children.flatMap((c) => (typeof c === "string" ? [] : c.all(pred)))];
  }
}

export const ui = new FakeNode("div");

export function stubDom(): void {
  vi.stubGlobal("document", {
    createElement: (t: string) => new FakeNode(t),
    createElementNS: (_ns: string, t: string) => new FakeNode(t),
    createTextNode: (text: string) => Object.assign(new FakeNode("#text"), { children: [text] }),
    getElementById: () => ui,
    body: { insertAdjacentHTML: () => {} },
    querySelector: () => null,
  });
  vi.stubGlobal("getComputedStyle", () => ({ overflowY: "visible", paddingBottom: "0px", getPropertyValue: () => "" }));
  vi.stubGlobal("window", { addEventListener: () => {}, matchMedia: () => ({ matches: false, addEventListener: () => {} }), innerWidth: 1280, innerHeight: 720 });
}
