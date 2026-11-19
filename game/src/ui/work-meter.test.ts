import { afterEach, describe, expect, it, vi } from 'vitest';
import { say } from '../text/language';
import { resolve } from '../text/resolve';
import { verbatim } from '../text/msg';
import { WORK_CELLS_MAX, workMeterBar, workTurnsText } from './work-meter';

class Node {
  className = '';
  attrs: Record<string, string> = {};
  children: Node[] = [];
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string) { this.attrs[name] = value; }
  removeAttribute(name: string) { delete this.attrs[name]; }
  addEventListener() {}
  append(...children: Node[]) { this.children.push(...children); }
}

function bar(turnsLeft: number, total: number): Node {
  return workMeterBar({ turnsLeft, total }, verbatim('Search')) as unknown as Node;
}

describe('work meter', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(): void {
    vi.stubGlobal('document', {
      createElement: (tag: string) => new Node(tag),
      createTextNode: (value: string) => Object.assign(new Node('#text'), { data: value }),
    });
  }

  it('draws one cell per turn and fills the turns done', () => {
    stub();
    const meter = bar(4, 8);
    expect(meter.className).toBe('segments job-bar progress');
    expect(meter.attrs.style).toBeUndefined();
    expect(meter.children).toHaveLength(8);
    expect(meter.children.filter((c) => c.className === 'on')).toHaveLength(4);
    expect(meter.children.slice(0, 4).every((c) => c.className === 'on')).toBe(true);
    expect(meter.children.every((c) => c.attrs['aria-hidden'] === 'true')).toBe(true);
  });

  it('shows an empty and a full row at the ends of a job', () => {
    stub();
    expect(bar(8, 8).children.filter((c) => c.className === 'on')).toHaveLength(0);
    expect(bar(0, 8).children.filter((c) => c.className === 'on')).toHaveLength(8);
  });

  it('keeps one cell per turn at the cap and spreads longer work over the capped row', () => {
    stub();
    const lit = (meter: Node) => meter.children.filter((c) => c.className === 'on').length;
    expect(bar(5, WORK_CELLS_MAX).children).toHaveLength(WORK_CELLS_MAX);
    expect(lit(bar(5, WORK_CELLS_MAX))).toBe(WORK_CELLS_MAX - 5);
    const long = bar(5, WORK_CELLS_MAX + 1);
    expect(long.className).toBe('segments job-bar progress');
    expect(long.children).toHaveLength(WORK_CELLS_MAX);
    expect(lit(long)).toBe(7);
    expect(long.attrs['aria-valuenow']).toBe('62');
  });

  it('shows a long job as empty only at the start, and full only when done', () => {
    stub();
    const lit = (meter: Node) => meter.children.filter((c) => c.className === 'on').length;
    expect(lit(bar(21, 21))).toBe(0);
    expect(lit(bar(20, 21))).toBe(1);
    expect(lit(bar(1, 21))).toBe(WORK_CELLS_MAX - 1);
    expect(lit(bar(0, 21))).toBe(WORK_CELLS_MAX);
  });

  it('gives the exact count in the title and the value text, in both languages', () => {
    stub();
    const meter = bar(4, 8);
    expect(meter.attrs.title).toBe('4 of 8 turns left');
    expect(meter.attrs['aria-valuetext']).toBe('4 of 8 turns left');
    expect(meter.attrs['aria-valuenow']).toBe('50');
    expect(say(workTurnsText({ turnsLeft: 1, total: 1 }))).toBe('1 of 1 turn left');
    expect(resolve(workTurnsText({ turnsLeft: 4, total: 8 }), 'ru')).toBe('Осталось 4 из 8 ходов');
    expect(resolve(workTurnsText({ turnsLeft: 1, total: 21 }), 'ru')).toBe('Остался 1 из 21 хода');
  });
});
