import { describe, expect, it } from 'vitest';
import { TEST_MAP } from '../test/map';
import { surveySites } from './survey';
import { surveyPictureCenter, surveyPictureKey } from './survey-picture';

const sites = surveySites(TEST_MAP);

describe('survey picture key', () => {
  it('differs between sites', () => {
    expect(new Set(sites.map(surveyPictureKey)).size).toBe(sites.length);
  });

  it('changes when a prop moves or another prop stands in its place', () => {
    const site = sites[0];
    const moved = structuredClone(site);
    moved.props[0].pos.x += 0.5;
    const swapped = structuredClone(site);
    swapped.props[0].id = 'other';
    expect(surveyPictureKey(moved)).not.toBe(surveyPictureKey(site));
    expect(surveyPictureKey(swapped)).not.toBe(surveyPictureKey(site));
  });

  it('ignores a move below a hundredth of a tile', () => {
    const site = structuredClone(sites[0]);
    const key = surveyPictureKey(site);
    site.props[0].pos.x += 0.0001;
    expect(surveyPictureKey(site)).toBe(key);
  });
});

describe('survey picture center', () => {
  it('has every reach circle of the site as far to one side as to the other', () => {
    for (const site of sites) {
      const c = surveyPictureCenter(site);
      const left = Math.min(...site.props.map((p) => p.pos.x - p.reach));
      const right = Math.max(...site.props.map((p) => p.pos.x + p.reach));
      const top = Math.min(...site.props.map((p) => p.pos.y - p.reach));
      const bottom = Math.max(...site.props.map((p) => p.pos.y + p.reach));
      expect(c.x - left, site.id).toBeCloseTo(right - c.x);
      expect(c.y - top, site.id).toBeCloseTo(bottom - c.y);
    }
  });

  it('is the prop itself for a lone prop', () => {
    const lone = sites.find((s) => s.props.length === 1)!;
    expect(surveyPictureCenter(lone)).toEqual(lone.props[0].pos);
  });
});
