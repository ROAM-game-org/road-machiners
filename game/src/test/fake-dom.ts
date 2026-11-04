import { vi } from "vitest";

export class FakeNode {
  static active: FakeNode | null = null;
  attrs: Record<string, string> = {};
  className = "";
  children: (FakeNode | string)[] = [];
  listeners = new Map<string, ((e: unknown) => void)[]>();
  parent: FakeNode | null = null;
  hidden = false;
  focused = 0;
  constructor(readonly tag: string) {}
  get textContent(): string { return this.children.map((c) => (typeof c === "string" ? c : c.textContent)).join(""); }
  set textContent(text: string) { this.children = [text]; }
  append(...c: (FakeNode | string)[]) { for (const n of c) if (typeof n !== "string") n.parent = this; this.children.push(...c); }
  replaceChildren(...c: (FakeNode | string)[]) { this.children = []; this.append(...c); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; if (k === "hidden") this.hidden = true; }
  addEventListener(type: string, fn: (e: unknown) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  removeEventListener(type: string, fn: (e: unknown) => void) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn)); }
  focus() { this.focused++; FakeNode.active = this; }
  fire(type: string, e: object = {}) { for (const f of this.listeners.get(type) ?? []) f({ stopPropagation: () => {}, preventDefault: () => {}, ...e }); }
  all(pred: (n: FakeNode) => boolean): FakeNode[] {
    return [...(pred(this) ? [this] : []), ...this.children.flatMap((c) => (typeof c === "string" ? [] : c.all(pred)))];
  }
  button(text: string): FakeNode {
    const found = this.all((n) => n.tag === "button" && n.textContent.includes(text))[0];
    if (!found) throw new Error(`No ${text} button`);
    return found;
  }
  withClass(cls: string): FakeNode | null {
    return this.all((n) => n.className.split(" ").includes(cls))[0] ?? null;
  }
}

export type FakePage = { ui: FakeNode; win: FakeNode; opener: FakeNode };

export function stubPage(): FakePage {
  const ui = new FakeNode("div");
  const win = new FakeNode("window");
  const opener = new FakeNode("button");
  FakeNode.active = opener;
  vi.stubGlobal("document", {
    createElement: (t: string) => new FakeNode(t),
    createTextNode: (text: string) => Object.assign(new FakeNode("#text"), { children: [text] }),
    getElementById: () => ui,
    get activeElement() { return FakeNode.active; },
  });
  vi.stubGlobal("window", win);
  return { ui, win, opener };
}
