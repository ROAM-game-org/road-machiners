import { el } from "./dom";
import { loadArt } from "./quest-screen";

export class ArtBand {
  private images = new Map<string, HTMLImageElement>();
  private shown: string | null = null;
  private shownAt = 0;

  frame(key: string | null): HTMLElement {
    if (key !== this.shown) this.shownAt = performance.now();
    this.shown = key;
    this.hold(key);
    const img = key === null ? null : (this.images.get(key) ?? null);
    if (img) img.style.animationDelay = `${this.shownAt - performance.now()}ms`;
    return el("div", { class: "art-band" }, img);
  }

  clear(): void {
    this.hold(null);
    this.shown = null;
  }

  private hold(key: string | null): void {
    for (const [held, img] of this.images) {
      if (held === key) continue;
      img.onerror = null;
      if (img.src.startsWith("blob:")) URL.revokeObjectURL(img.src);
      img.removeAttribute("src");
      this.images.delete(held);
    }
    if (key !== null && !this.images.has(key)) this.images.set(key, loadArt(key, (img) => this.images.get(key) === img));
  }
}
