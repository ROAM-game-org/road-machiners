import { describe, expect, it } from 'vitest';
import { surveySites } from '../sim/survey';
import { TEST_MAP } from '../test/map';
import { surveyPictureUrl } from './survey-picture';

describe('survey picture url', () => {
  it('names the file of every survey site', () => {
    for (const site of surveySites(TEST_MAP)) expect(surveyPictureUrl(site.id)).toContain(`survey/${site.id}.webp`);
  });

  it('refuses a site with no picture and says how to make it', () => {
    expect(() => surveyPictureUrl('survey-nowhere')).toThrow(/npm run survey:pictures/);
  });
});
