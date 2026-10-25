import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { surveySites } from '../sim/survey';
import { surveyPictureKey } from '../sim/survey-picture';
import { TEST_MAP } from '../test/map';
import MANIFEST from './survey-pictures.json';

const sites = surveySites(TEST_MAP);
const REBUILD = 'Run npm run survey:pictures after npm run old-spots.';
const WEBP_HEADER = ['RIFF', 'WEBP'];

describe('survey pictures', () => {
  it('belong to the map the survey sites were baked for', () => {
    expect(MANIFEST.mapHash, REBUILD).toBe(TEST_MAP.hash);
  });

  it('cover exactly the survey sites', () => {
    expect(Object.keys(MANIFEST.sites).sort(), REBUILD).toEqual(sites.map((s) => s.id).sort());
  });

  it('were drawn from the sites as they stand now', () => {
    const keys = Object.fromEntries(sites.map((s) => [s.id, surveyPictureKey(s)]));
    expect(MANIFEST.sites, REBUILD).toEqual(keys);
  });

  it('exist as webp files', () => {
    for (const s of sites) {
      const path = `public/survey/${s.id}.webp`;
      expect(existsSync(path), `${path} is missing. ${REBUILD}`).toBe(true);
      const bytes = readFileSync(path);
      expect([bytes.subarray(0, 4).toString('latin1'), bytes.subarray(8, 12).toString('latin1')], path).toEqual(WEBP_HEADER);
    }
  });
});
