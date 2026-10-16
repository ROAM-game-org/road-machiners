
declare const __GAME_VERSION__: string;
export const GAME_VERSION = __GAME_VERSION__;

declare const __ERROR_REPORT_URL__: string;
declare const __ERROR_REPORT_BUILD__: string;
export const ERROR_REPORT_URL = __ERROR_REPORT_URL__;
export const ERROR_REPORT_BUILD = __ERROR_REPORT_BUILD__;

export const TOUCH = {
  slopPx: 10,
  longPressMs: 500,
};

declare const __SFX_BYTES__: Record<string, number>;
export const SFX_BYTES = __SFX_BYTES__;
declare const __PUBLIC_HASHES__: Record<string, string>;
export const PUBLIC_HASHES = __PUBLIC_HASHES__;
declare const __FEEDBACK_URL__: string;
export const FEEDBACK_URL = __FEEDBACK_URL__;

export const DOWNLOAD = { tries: 3, waitMs: [1000, 3000] };

export const CONFIG = {
  startKit: 'arrival',
  seed: null as number | null,
  utilityBandMs: 1000,
  combatReadMs: 1100,
  playEaseMs: 350,
  fxFillScreens: 8,
  saveTurns: 20,
  saveSlots: 3,
  travelHoldMs: 250,
  travelFastSpeed: 4,
  playbackFrameMs: 50,
  questCharMs: 25,
  questWordMs: 125,
  questLineMs: 300,
  questPauseMs: 700,
};

export const OUTPOST_GATE = { slideSeconds: 2.5 };
