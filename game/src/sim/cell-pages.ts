export type PageArray = Uint8Array | Int8Array | Uint32Array | Int32Array | Float32Array | Float64Array;

export type PageFiller<A extends PageArray> = (page: A, x0: number, y0: number) => void;

export class CellPages<A extends PageArray> {
  private readonly shift: number;
  private readonly mask: number;
  private readonly across: number;
  private readonly pages: (A | undefined)[];
  private held = 0;

  constructor(
    readonly side: number,
    readonly pageSide: number,
    private readonly make: (length: number) => A,
    readonly blank: number,
    private readonly filler: PageFiller<A> | null = null,
  ) {
    if (pageSide < 1 || (pageSide & (pageSide - 1)) !== 0) throw new Error(`CellPages: page side ${pageSide} is not a power of two`);
    this.shift = Math.log2(pageSide);
    this.mask = pageSide - 1;
    this.across = Math.ceil(side / pageSide);
    this.pages = new Array<A | undefined>(this.across * this.across).fill(undefined);
  }

  at(i: number): number {
    this.checkIndex(i);
    const y = (i / this.side) | 0;
    return this.read(i - y * this.side, y);
  }

  set(i: number, v: number): void {
    this.checkIndex(i);
    const y = (i / this.side) | 0;
    this.write(i - y * this.side, y, v);
  }

  atXY(x: number, y: number): number {
    this.checkXY(x, y);
    return this.read(x, y);
  }

  setXY(x: number, y: number, v: number): void {
    this.checkXY(x, y);
    this.write(x, y, v);
  }

  pageOf(x: number, y: number): A {
    this.checkXY(x, y);
    const p = this.pageAt(x, y);
    return this.pages[p] ?? this.open(p, x, y);
  }

  offsetOf(x: number, y: number): number {
    return ((y & this.mask) << this.shift) | (x & this.mask);
  }

  fillRow(y: number, x0: number, x1: number, v: number): void {
    this.checkXY(x0, y);
    this.checkXY(x1, y);
    const row = (y & this.mask) << this.shift;
    for (let x = x0; x <= x1; x = ((x >> this.shift) + 1) << this.shift) {
      const end = Math.min(x1, (((x >> this.shift) + 1) << this.shift) - 1);
      const p = this.pageAt(x, y);
      const page = this.pages[p];
      if (page === undefined && v === this.blank && this.filler === null) continue;
      (page ?? this.open(p, x, y)).fill(v, row + (x & this.mask), row + (end & this.mask) + 1);
    }
  }

  pageCount(): number {
    return this.held;
  }

  bytes(): number {
    let total = 0;
    for (const page of this.pages) if (page !== undefined) total += page.byteLength;
    return total;
  }

  release(): void {
    this.pages.fill(undefined);
    this.held = 0;
  }

  releaseOver(maxPages: number): void {
    if (this.held > maxPages) this.release();
  }

  private read(x: number, y: number): number {
    const p = this.pageAt(x, y);
    const page = this.pages[p];
    if (page !== undefined) return page[((y & this.mask) << this.shift) | (x & this.mask)];
    return this.filler === null ? this.blank : this.open(p, x, y)[((y & this.mask) << this.shift) | (x & this.mask)];
  }

  private write(x: number, y: number, v: number): void {
    const p = this.pageAt(x, y);
    (this.pages[p] ?? this.open(p, x, y))[((y & this.mask) << this.shift) | (x & this.mask)] = v;
  }

  private pageAt(x: number, y: number): number {
    return (y >> this.shift) * this.across + (x >> this.shift);
  }

  private open(p: number, x: number, y: number): A {
    const page = this.make(this.pageSide * this.pageSide);
    if (this.blank !== 0) page.fill(this.blank);
    if (this.filler !== null) this.filler(page, (x >> this.shift) << this.shift, (y >> this.shift) << this.shift);
    this.pages[p] = page;
    this.held++;
    return page;
  }

  private onSide(v: number): boolean {
    return v >>> 0 === v && v < this.side;
  }

  private checkIndex(i: number): void {
    if (!(i >>> 0 === i && i < this.side * this.side)) throw new Error(`CellPages: index ${i} is outside the ${this.side} by ${this.side} grid`);
  }

  private checkXY(x: number, y: number): void {
    if (!(this.onSide(x) && this.onSide(y))) throw new Error(`CellPages: cell ${x},${y} is outside the ${this.side} by ${this.side} grid`);
  }
}
