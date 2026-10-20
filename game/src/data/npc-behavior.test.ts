import { describe, expect, it } from 'vitest';
import { ATTITUDE, BANDS, FACTIONS, NPC_FACTION_IDS, SCORE_LIMIT, startStanding } from './npc-behavior';

describe('faction table', () => {
  it('scores every pair of NPC factions with a whole number in range', () => {
    for (const a of NPC_FACTION_IDS) {
      expect(Object.keys(ATTITUDE[a]).sort()).toEqual([...NPC_FACTION_IDS].sort());
      for (const b of NPC_FACTION_IDS) {
        const score = ATTITUDE[a][b];
        expect(Number.isInteger(score)).toBe(true);
        expect(Math.abs(score)).toBeLessThanOrEqual(SCORE_LIMIT);
      }
    }
  });

  it('makes every organized faction allied with itself and no pair hostile', () => {
    for (const id of NPC_FACTION_IDS.filter((f) => FACTIONS[f].organized)) expect(ATTITUDE[id][id]).toBeGreaterThanOrEqual(BANDS.allied);
    for (const a of NPC_FACTION_IDS) for (const b of NPC_FACTION_IDS) expect(ATTITUDE[a][b]).toBeGreaterThan(BANDS.hostile);
  });

  it('sets Scrapjaw and Kiln apart, and Kiln lets Bowl pass while Bowl does not trust Kiln', () => {
    expect(ATTITUDE.kiln.bowl).not.toBe(ATTITUDE.scrapjaw.bowl);
    expect(ATTITUDE.kiln.bowl).toBeGreaterThan(-BANDS.friendly);
    expect(ATTITUDE.bowl.kiln).toBeLessThanOrEqual(BANDS.unfriendly);
  });

  it('keeps the Sunward wary of everyone, and Bowl and Nose warier of them than the rest', () => {
    for (const id of NPC_FACTION_IDS.filter((f) => f !== 'sunward')) expect(ATTITUDE.sunward[id]).toBe(-20);
    expect(ATTITUDE.bowl.sunward).toBe(-30);
    expect(ATTITUDE.nose.sunward).toBe(-30);
    expect(FACTIONS.sunward).toEqual({ organized: true, outlaw: true });
  });

  it('starts the player at each organized faction view of an outside driver and gives independents no standing', () => {
    expect(startStanding()).toEqual({ bowl: 5, nose: 5, guidestar: 10, administrators: 10, scrapjaw: -30, kiln: -30, sunward: -20 });
    expect('independent' in startStanding()).toBe(false);
  });
});
