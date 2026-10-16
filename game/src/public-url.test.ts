import { describe, expect, it } from 'vitest';
import { publicUrl } from './public-url';

const built = { hashes: { 'maps/icarus.bin': 'abcd1234' }, base: './', dev: false };

describe('publicUrl', () => {
  it('appends the content hash in a build', () => {
    expect(publicUrl('maps/icarus.bin', built)).toBe('./maps/icarus.bin?v=abcd1234');
  });

  it('gives the plain url in dev for a file with no hash', () => {
    expect(publicUrl('maps/icarus.bin', { ...built, hashes: {}, dev: true })).toBe('./maps/icarus.bin');
  });

  it('throws in a build for a file missing from the table', () => {
    expect(() => publicUrl('models/none.glb', built)).toThrow('Public file models/none.glb is not in this build');
  });
});
