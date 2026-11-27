import { describe, expect, it } from 'vitest';
import { startsFullscreen } from './handheld';

describe('starting fullscreen', () => {
  it('fills the screen on a Steam Deck and in Steam Big Picture', () => {
    expect(startsFullscreen({ SteamDeck: '1' }, [])).toBe(true);
    expect(startsFullscreen({ SteamGamepadUI: '1' }, [])).toBe(true);
  });

  it('fills the screen when launched with --fullscreen, as a ROG Ally shortcut can be', () => {
    expect(startsFullscreen({}, ['--fullscreen'])).toBe(true);
  });

  it('opens a window on a desktop, or when asked for one', () => {
    expect(startsFullscreen({}, [])).toBe(false);
    expect(startsFullscreen({ SteamDeck: '1' }, ['--windowed'])).toBe(false);
  });
});
