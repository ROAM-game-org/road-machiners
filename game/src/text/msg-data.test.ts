import { describe, expect, it } from 'vitest';
import { list, num, sameMsg, t, verbatim } from './msg';
import { msgData, msgOfData } from './msg-data';
import { resolve } from './resolve';

describe('message data', () => {
  it('gives back the same message after a trip through JSON', () => {
    const msg = t('npc.cargoAndSpares', { goods: verbatim('Rustbucket'), spares: list([t('part.cab'), num(3, 'int')]) });
    const back = msgOfData(JSON.parse(JSON.stringify(msgData(msg))));
    expect(back && sameMsg(back, msg)).toBe(true);
    expect(resolve(back!, 'en')).toBe(resolve(msg, 'en'));
  });

  it('keeps plain keys small', () => {
    expect(msgData(t('log.death'))).toEqual({ key: 'log.death' });
  });

  it('refuses data that is not a message', () => {
    expect(msgOfData(null)).toBeNull();
    expect(msgOfData({ key: 7 })).toBeNull();
    expect(msgOfData({ key: 'log.death', params: { who: true } })).toBeNull();
    expect(msgOfData({ key: 'log.death', items: [{ nokey: 1 }] })).toBeNull();
    expect(msgOfData({ key: 'log.death', params: [] })).toBeNull();
  });
});
