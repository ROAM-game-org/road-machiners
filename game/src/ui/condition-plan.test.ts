import { describe, expect, it } from 'vitest';
import { partDef } from '../data/parts';
import { baseGrid, itemCells } from '../sim/grid';
import { cellSteps } from '../sim/body';
import { emptyWorld } from '../sim/testkit';
import { conditionItems } from '../three/render/portraitPixels';
import { ConditionPlan, planRects, type PlanPart } from './condition-plan';

const PX = 50;

function cellsOf(chassisId: string) {
  const steps = cellSteps(chassisId);
  return { w: steps.col * PX, h: steps.row * PX };
}

describe('planRects', () => {
  it('sizes the plan from the chassis grid', () => {
    const grid = baseGrid('scout');
    const cell = cellsOf('scout');
    const plan = planRects('scout', [], PX);
    expect(plan.width).toBeCloseTo(grid.w * cell.w);
    expect(plan.height).toBeCloseTo(grid.h * cell.h);
  });

  it('puts the front row at the bottom', () => {
    const cell = cellsOf('scout');
    const front: PlanPart = { id: 'front', x: 1, y: 0, w: 1, h: 1 };
    const grid = baseGrid('scout');
    const rear: PlanPart = { id: 'rear', x: 1, y: grid.h - 1, w: 1, h: 1 };
    const { rects } = planRects('scout', [front, rear], PX);
    const [frontRect, rearRect] = rects;
    expect(frontRect.y).toBeGreaterThan(rearRect.y);
    expect(frontRect.y + frontRect.h).toBeCloseTo(planRects('scout', [], PX).height);
    expect(frontRect.h).toBeCloseTo(cell.h);
  });

  it('covers exactly the cells of a part wider than one cell', () => {
    const cell = cellsOf('scout');
    const { rects, width } = planRects('scout', [{ id: 'wide', x: 1, y: 2, w: 2, h: 1 }], PX);
    expect(rects[0].w).toBeCloseTo(2 * cell.w);
    expect(rects[0].x + rects[0].w).toBeCloseTo(width - cell.w);
  });

  it('throws on a part outside the chassis grid', () => {
    const grid = baseGrid('scout');
    expect(() => planRects('scout', [{ id: 'out', x: grid.w, y: 0, w: 1, h: 1 }], PX)).toThrow(/out/);
    expect(() => planRects('scout', [{ id: 'neg', x: -1, y: 0, w: 1, h: 1 }], PX)).toThrow(/neg/);
    expect(() => planRects('scout', [{ id: 'tall', x: 0, y: grid.h - 1, w: 1, h: 2 }], PX)).toThrow(/tall/);
  });

  it('works on a longer chassis', () => {
    const grid = baseGrid('semi');
    const part: PlanPart = { id: 'mid', x: 1, y: 3, w: 1, h: 2 };
    expect(grid.h).toBeGreaterThan(5);
    expect(planRects('semi', [part], PX).rects[0].h).toBeCloseTo(2 * cellsOf('semi').h);
  });
});

describe('ConditionPlan', () => {
  const truck = emptyWorld().vehicles[0];
  const items = conditionItems(truck);

  it('finds each part at the center of its box', () => {
    const plan = new ConditionPlan(truck.chassisId, items, PX);
    const stacked = (item: (typeof items)[number]) => items.some((other) => other !== item && itemCells(other).some((c) => itemCells(item).some((d) => d.x === c.x && d.y === c.y)));
    for (const item of items.filter((it) => !stacked(it))) {
      const center = plan.centerOf(item.part.id);
      expect(plan.partAt(center.x, center.y)).toBe(item.part.id);
    }
  });

  it('gives a cell shared with a part below deck to the part on top', () => {
    const wheel = items.find((it) => partDef(it.part.defId).kind === 'core' && (partDef(it.part.defId) as { role: string }).role === 'wheel')!;
    const top = { ...wheel, id: 'top', part: { id: 'top-part', defId: 'mg', hp: 1, wear: 0 } };
    const plan = new ConditionPlan(truck.chassisId, [top, wheel], PX);
    const center = plan.centerOf(wheel.part.id);
    expect(plan.partAt(center.x, center.y)).toBe('top-part');
  });

  it('knows every condition part and no other', () => {
    const plan = new ConditionPlan(truck.chassisId, items, PX);
    expect(items.every((item) => plan.has(item.part.id))).toBe(true);
    expect(plan.has('nope')).toBe(false);
  });

  it('finds nothing outside the plan', () => {
    const plan = new ConditionPlan(truck.chassisId, items, PX);
    expect(plan.partAt(-5, -5)).toBeNull();
    expect(plan.partAt(plan.width + 5, plan.height + 5)).toBeNull();
  });

  it('refuses the center of a part it does not hold', () => {
    expect(() => new ConditionPlan(truck.chassisId, items, PX).centerOf('nope')).toThrow(/nope/);
  });
});
