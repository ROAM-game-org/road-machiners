export type Bus = "ui" | "sfx" | "ambient" | "music";

export type CueDef = {
  bus: Bus;
  volume: number;
  pitchJitter: number;
  maxVoices: number;
  loop: boolean;
  setup?: Setup;
  beat?: Beat;
  prompts?: readonly string[];
  seconds?: number;
  perFight?: true;
};

export type Cue = CueDef & { files: string[] };

export type Setup = "field" | "cab";

export type Beat = { bpm: number; bars: number };
export const BEATS_PER_BAR = 4;

export function beatLoopSeconds(b: Beat): number {
  return (b.bars * BEATS_PER_BAR * 60) / b.bpm;
}

export const SOUND_STYLE: Record<Setup, string> = {
  field: "Realistic sound effect, one field microphone about 10 meters away, outdoors in a dry desert, natural and unprocessed, full frequency range, no cinematic whoosh, no sub-bass boom, no music, no voices.",
  cab: "Realistic foley, one close microphone inside an old truck cab, natural and unprocessed, dry, no reverb, no electronic sounds, no music, no voices.",
};

const SONG_PART = { bus: "music", volume: 1, pitchJitter: 0, maxVoices: 1, loop: false, perFight: true } as const;

const DEFS = {
  "ui-click": { bus: "ui", setup: "cab", pitchJitter: 0.04, maxVoices: 2, volume: 0.6, loop: false, prompts: ["Single click of an old metal toggle switch on a truck dashboard."], seconds: 0.5 },
  "ui-open": { bus: "ui", setup: "cab", pitchJitter: 0, maxVoices: 1, volume: 0.7, loop: false, prompts: ["Rusty metal glovebox latch opening with a short creak."], seconds: 0.8 },
  "ui-close": { bus: "ui", setup: "cab", pitchJitter: 0, maxVoices: 1, volume: 0.7, loop: false, prompts: ["Heavy metal lid shutting with a dull latch clack."], seconds: 0.6 },
  "ui-confirm": { bus: "ui", setup: "cab", pitchJitter: 0, maxVoices: 1, volume: 0.8, loop: false, prompts: ["Heavy steel ratchet clicking tight, a deal sealed."], seconds: 0.6 },
  "radio": { bus: "ui", setup: "cab", pitchJitter: 0.03, maxVoices: 1, volume: 0.8, loop: false, prompts: ["Old CB radio in a truck cab: the handset key clicks, then a short burst of analog static squelch crackles from the dashboard speaker."], seconds: 1.2 },
  "ui-error": { bus: "ui", setup: "cab", pitchJitter: 0, maxVoices: 1, volume: 0.8, loop: false, prompts: ["Dull thud of a jammed metal lever that will not move."], seconds: 0.5 },

  "money": { bus: "ui", setup: "cab", volume: 0.8, pitchJitter: 0.03, maxVoices: 1, loop: false, prompts: ["A few smooth heavy metal discs clink together and drop into a tin box."], seconds: 1 },
  "level-up": { bus: "ui", setup: "cab", volume: 1, pitchJitter: 0, maxVoices: 1, loop: false, prompts: ["Heavy steel lever slams and locks into place with a deep satisfying clunk, then a short bright ring of struck metal."], seconds: 2 },
  "discover": { bus: "ui", setup: "cab", volume: 0.9, pitchJitter: 0, maxVoices: 1, loop: false, prompts: ["Short low mysterious metallic swell with distant wind, a place revealed."], seconds: 2 },
  "air-brake": { bus: "sfx", setup: "field", volume: 0.5, pitchJitter: 0.03, maxVoices: 1, loop: false, prompts: ["Heavy truck air brakes hiss as it stops on gravel."], seconds: 1.5 },
  "defeat": { bus: "ui", setup: "cab", volume: 1, pitchJitter: 0, maxVoices: 1, loop: false, prompts: ["Low ominous boom fading into a dying engine and silence."], seconds: 3 },

  "mg-fire": { bus: "sfx", setup: "field", volume: 0.6, pitchJitter: 0.06, maxVoices: 6, loop: false, prompts: ["Single heavy machine gun shot outdoors, sharp crack with a short echo."], seconds: 0.6 },
  "cannon-fire": { bus: "sfx", setup: "field", volume: 0.9, pitchJitter: 0.04, maxVoices: 3, loop: false, prompts: ["One loud 30mm autocannon shot fired close by, sharp supersonic crack, powerful punchy boom, metallic breech clank, short echo off rocks."], seconds: 1.5 },
  "gun-empty": { bus: "sfx", setup: "field", volume: 0.8, pitchJitter: 0.05, maxVoices: 3, loop: false, prompts: ["A mounted heavy machine gun runs dry: two dry metallic clicks of the bolt, then a steel ammo box latch snaps open and the empty box drops onto a truck deck with a hollow clunk."], seconds: 1.2 },
  "hit-metal": { bus: "sfx", setup: "field", volume: 0.55, pitchJitter: 0.08, maxVoices: 6, loop: false, prompts: ["Bullet slams into a thick steel truck plate, hard metallic clang."], seconds: 0.6 },
  "miss": { bus: "sfx", setup: "field", volume: 0.4, pitchJitter: 0.1, maxVoices: 6, loop: false, prompts: ["Bullet ricochet whizzing off rocks and kicking up dirt."], seconds: 0.8 },
  "part-broken": { bus: "sfx", setup: "field", volume: 0.7, pitchJitter: 0.05, maxVoices: 2, loop: false, prompts: ["Truck part breaks apart, snapping metal, sparks and a short hiss of steam."], seconds: 1.2 },
  "explosion": { bus: "sfx", setup: "field", volume: 1, pitchJitter: 0.04, maxVoices: 2, loop: false, prompts: ["Truck fuel tank explodes, big fiery blast with falling metal debris."], seconds: 3 },
  "horn": { bus: "sfx", setup: "field", volume: 0.8, pitchJitter: 0, maxVoices: 4, loop: false, prompts: ["Mad Max war rig horn: a huge rusted diesel truck blasts its twin air horns once, a deep booming low chord, brassy, gritty and overdriven, heavy as a freight train. Vehicle horn only, no music."], seconds: 1.5 },
  "crash": { bus: "sfx", setup: "field", volume: 0.9, pitchJitter: 0.06, maxVoices: 2, loop: false, prompts: ["Two heavy steel trucks ram each other at speed: one hard, deep crunch of thick metal, a short scrape, then debris settling. Single impact."], seconds: 1.5 },

  "harpoon-fire": { bus: "sfx", setup: "field", volume: 0.8, pitchJitter: 0.05, maxVoices: 2, loop: false, prompts: ["A heavy spring-loaded harpoon gun on a truck fires: a deep mechanical thunk and clank of steel, then a thick rope whipping out fast."], seconds: 1.2 },
  "harpoon-hook": { bus: "sfx", setup: "field", volume: 0.7, pitchJitter: 0.06, maxVoices: 2, loop: false, prompts: ["A heavy barbed steel harpoon bolt slams into a truck's steel plate: a hard punching clank and a short metallic scrape."], seconds: 0.8 },
  "line-tear": { bus: "sfx", setup: "field", volume: 0.8, pitchJitter: 0.05, maxVoices: 2, loop: false, prompts: ["A thick steel tow cable under huge tension snaps: a sharp loud twang and whip, then the loose cable slapping on metal."], seconds: 1.2 },

  "mortar-fire": { bus: "sfx", setup: "field", volume: 0.8, pitchJitter: 0.05, maxVoices: 2, loop: false, prompts: ["A small smoke mortar fires from a truck deck: one deep hollow tube thoomp and a short metallic ring."], seconds: 1.2 },
  "smoke-burst": { bus: "sfx", setup: "field", volume: 0.6, pitchJitter: 0.05, maxVoices: 2, loop: false, prompts: ["A smoke grenade canister bursts open: a short pop, then a loud rushing hiss of thick smoke pouring out."], seconds: 2 },
  "flare-fire": { bus: "sfx", setup: "field", volume: 0.7, pitchJitter: 0.05, maxVoices: 2, loop: false, prompts: ["A flare cannon fires a signal flare: a sharp hollow pop, then a fizzing hiss rising quickly into the sky."], seconds: 1.5 },
  "flare-burst": { bus: "sfx", setup: "field", volume: 0.6, pitchJitter: 0.04, maxVoices: 2, loop: false, prompts: ["A magnesium illumination flare ignites high in the air: a dull crack, then a steady crackling, sizzling burn."], seconds: 2 },
  "caltrops-drop": { bus: "sfx", setup: "field", volume: 0.6, pitchJitter: 0.06, maxVoices: 2, loop: false, prompts: ["A handful of heavy steel spikes dumped from a truck clatter and bounce onto hard gravel."], seconds: 1.2 },
  "caltrops-hit": { bus: "sfx", setup: "field", volume: 0.7, pitchJitter: 0.06, maxVoices: 3, loop: false, prompts: ["A truck tire runs over steel spikes and bursts: a loud pop and a fast rushing hiss of escaping air."], seconds: 1.2 },
  "oil-spill": { bus: "sfx", setup: "field", volume: 0.6, pitchJitter: 0.05, maxVoices: 2, loop: false, prompts: ["A valve opens under a truck and thick motor oil glugs and splashes onto dry dirt."], seconds: 2 },
  "emitter-pulse": { bus: "sfx", setup: "field", volume: 0.8, pitchJitter: 0.04, maxVoices: 2, loop: false, prompts: ["A huge electrical capacitor discharges outdoors: a violent arc crack and buzz, then nearby diesel engines sputter and die."], seconds: 2 },

  "engine": { bus: "sfx", setup: "field", volume: 0.6, pitchJitter: 0, maxVoices: 1, loop: true, prompts: ["Old heavy diesel truck engine running at steady medium revs, recorded close to the engine bay: clear exhaust note, mechanical clatter and valve tick, full and present, not muffled, seamless loop."], seconds: 4 },
  "engine-strain": { bus: "sfx", volume: 0.6, pitchJitter: 0, maxVoices: 1, loop: true },
  "wind": { bus: "ambient", setup: "field", volume: 1, pitchJitter: 0, maxVoices: 1, loop: true, prompts: ["Dry desert wind blowing over open sand and rocks, steady, seamless loop."], seconds: 12 },
  "music-calm": { bus: "music", volume: 1, pitchJitter: 0, maxVoices: 1, loop: true, prompts: ["Slow sparse post-apocalyptic desert road music, lonely twangy baritone guitar and low drone, 80 bpm, instrumental, seamless loop.", "Slow sparse desert ambient, dusty harmonica and distant slide guitar over a low drone, 70 bpm, instrumental, seamless loop.", "Quiet post-apocalyptic road ambient, soft muted electric guitar arpeggios and a low cello drone, 75 bpm, instrumental, seamless loop.", "Slow hypnotic Saharan desert blues, 80 bpm, instrumental. Tuareg-style looping electric guitar riff with pentatonic bends, tende drum, calabash and frame drums, a droning imzad fiddle and a low drone. A baritone sax and muted trumpet play a dark minor-key Ethiopian jazz melody, rare and distant, with long open space. Dry, dusty, wide open sound, warm 1970s analog live recording, no claps, no synths, seamless loop.", "Slow heavy groove, 70 bpm, instrumental. Dark, tough and determined, with swagger, not sad and not cheerful. Sludgy trucker doom metal: thick fuzzy downtuned guitar riff ringing out, heavy dragging bass, slow pounding drums with lots of space. Over it, a baritone sax and muted trumpet play a menacing, proud minor-key Ethiopian jazz melody in long slow notes. Raw 1970s band playing live in a dry garage, real acoustic drum kit, tube amps, tape. No 1980s sound, no synth pads, no arpeggiator, no electronic drums, no big reverb, no organ, no screaming, seamless loop."], seconds: 90 },

  "music-town": { bus: "music", volume: 1, pitchJitter: 0, maxVoices: 1, loop: true, prompts: ["Lively but hard wasteland junkyard groove for a trading town, 100 bpm, instrumental. Driving junk percussion: clanking scrap metal, hammered steel pipes, anvil hits, rattling chains and oil drums, over a dry acoustic drum kit and a deep upright bass riff. Baritone sax and trumpet stay in the background with a low, dark minor-key Ethiopian jazz line. Tough and gritty, not cheerful. Raw live recording in a dry room, tape. No electric guitar, no fuzz, no synths, no organ, seamless loop."], seconds: 90 },
  "music-outpost": { bus: "music", volume: 1, pitchJitter: 0, maxVoices: 1, loop: true, prompts: ["Dark, menacing wasteland outpost groove with a steady pulse, 92 bpm, instrumental. Brooding minor key, like a spaghetti western standoff: baritone sax and trumpet play a grim Ethiopian jazz melody up front, over a tight dry drum kit and quiet junk percussion of clanking scrap metal and steel pipes. A deep driving bass riff, and a gritty overdriven guitar kept low in the mix, playing short muted stabs, never blasting. Hard and watchful, still moving, never happy or bright. Raw 1970s band playing live in a dry room, tape, no synths, no organ, seamless loop."], seconds: 90 },
  "music-abandoned": { bus: "music", volume: 0.7, pitchJitter: 0, maxVoices: 1, loop: true, prompts: ["Quiet, vast background music for exploring the ruins of a dead city, 50 bpm, D minor, instrumental. A cello and a bowed double bass play long, slow, low minor notes that overlap and change slowly. Far away, a felt-muffled piano plays one low note now and then. A bowed sheet of rusted steel gives a faint, cold shimmer. Dry desert wind runs under everything. Eerie and ancient, a feeling of awe at something huge and long dead. Not sad and not cheerful. No melody, no riff, no beat, even level from start to end. Acoustic live recording, natural. No synths, no organ, no choir, seamless loop.", "Quiet, haunted background music for walking through dead ruins, 54 bpm, A minor, instrumental. A clean baritone guitar plays single low notes that ring out long, with wide gaps of space. A bowed double bass holds a low note under it and slowly moves. Soft knocks of hand-struck metal pipes echo far away. A deep Mongolian throat-singing hum rises and falls very quietly in the distance. Watchful and ancient, not sad and not cheerful. No melody, no repeating riff, no beat, even level from start to end. Raw live recording outdoors at night, tape. No synths, no organ, no trumpet, no static, seamless loop.", "Very still, quiet background music for exploring a fallen spaceship wreck in the desert, 46 bpm, D minor, instrumental. A bowed cymbal and a bowed steel rod hold long, soft, glassy tones that fade in and out very slowly. Under them, a bowed double bass holds one low note for a long time, then moves one step. Nothing else happens. Calm, cold and mysterious, something strange sleeps here. Not sad and not cheerful. Very few events, slow changes only, no swells, no rolls, no hits, no drums, no melody, flat even level from start to end. Acoustic live recording in a huge empty metal hall, natural. No synths, no electronic sounds, no choir, seamless loop."], seconds: 90 },
  "music-quest": { bus: "music", volume: 0.8, pitchJitter: 0, maxVoices: 1, loop: true, prompts: ["Quiet, slow wasteland background for reading, 70 bpm, instrumental. Soft junk-metal percussion played with felt mallets and brushes: muted knocks on steel pipes, a soft oil drum pulse, a brushed sheet of rusted tin, a faint chain rattle. A deep upright bass plays a slow, steady minor-key line. A muffled baritone guitar plucks a low note now and then. Calm, steady, even level, never loud. Raw live recording in a dry room, tape. No melody lead, no cymbals, no synths, no organ, seamless loop.", "Quiet, slow desert background for reading, 72 bpm, instrumental. Soft tribal hand drums: frame drum, tende and a low felt-mallet floor tom in a steady, hypnotic pattern, played gently. A bowed double bass holds long low minor notes. Far behind, a soft Mongolian throat-singing hum rises and falls. Dark and patient, not sad and not cheerful, even level. Raw live recording outdoors at night, dry, tape. No congas, no claps, no synths, no lead melody, seamless loop.", "Quiet, slow wasteland background for reading, 60 bpm, instrumental. A clean baritone guitar with slow tremolo plays sparse low minor chords that ring out, like a dark spaghetti western standoff heard from far away. A bowed double bass holds long low notes under it. A harmon-muted trumpet plays a short grim phrase rarely, distant, then long rests. Calm and watchful, not sad, even level. Raw 1970s live recording in a dry room, tape. No drums, no synths, no organ, no reverb wash, seamless loop."], seconds: 90 },
  "song-dust": SONG_PART,
  "song-dust-guitars": SONG_PART,
  "song-dust-cymbals": SONG_PART,
  "song-dusk": SONG_PART,
  "song-dusk-guitars": SONG_PART,
  "song-dusk-cymbals": SONG_PART,
} as const satisfies Record<string, CueDef>;

export type CueId = keyof typeof DEFS;

const ON_DISK = Object.keys(import.meta.glob("/public/sfx/*.ogg")).map((p) => p.split("/").pop()!);

export function filesOf(id: string, onDisk: string[]): string[] {
  return onDisk.filter((f) => new RegExp(`^${id}-\\d+\\.ogg$`).test(f)).sort((a, b) => variantNumber(a) - variantNumber(b));
}

function variantNumber(file: string): number {
  return Number(file.match(/-(\d+)\.ogg$/)![1]);
}

function withFiles(): Record<CueId, Cue> {
  const out = {} as Record<CueId, Cue>;
  for (const id of Object.keys(DEFS) as CueId[]) out[id] = { ...DEFS[id], files: filesOf(id, ON_DISK) };
  return out;
}

export const SOUNDS = withFiles();

export const BOOT_SOUNDS: Record<string, Cue> = Object.fromEntries(Object.entries(SOUNDS).filter(([, cue]) => !cue.perFight));

export function soundsWith(files: string[]): Record<string, Cue> {
  const picked = Object.entries(SOUNDS).filter(([, cue]) => cue.files.some((f) => files.includes(f)));
  const found = picked.flatMap(([, cue]) => cue.files).filter((f) => files.includes(f));
  if (found.length !== files.length) throw new Error(`No sound cue holds ${files.filter((f) => !found.includes(f)).join(", ")}`);
  return Object.fromEntries(picked.map(([id, cue]) => [id, { ...cue, files: cue.files.filter((f) => files.includes(f)) }]));
}

const ENGINE_FILES: Record<string, string> = {
  scout: "engine-2.ogg",
  hauler: "engine-3.ogg",
  buggy: "engine-1.ogg",
  wagon: "engine-2.ogg",
  courier: "engine-1.ogg",
  van: "engine-2.ogg",
  longbed: "engine-3.ogg",
  carrier: "engine-3.ogg",
  tractor: "engine-3.ogg",
  jeep: "engine-1.ogg",
  convertible: "engine-2.ogg",
  bus: "engine-3.ogg",
  loader: "engine-3.ogg",
  lincoln: "engine-2.ogg",
  niva: "engine-1.ogg",
  bukhanka: "engine-2.ogg",
  semi: "engine-3.ogg",
};

const HORN_SOUNDS: Record<string, { file: string; rate: number }> = {
  scout: { file: "horn-1.ogg", rate: 1 },
  hauler: { file: "horn-2.ogg", rate: 0.82 },
  buggy: { file: "horn-1.ogg", rate: 1.18 },
  wagon: { file: "horn-2.ogg", rate: 0.92 },
  courier: { file: "horn-2.ogg", rate: 1.18 },
  van: { file: "horn-1.ogg", rate: 0.92 },
  longbed: { file: "horn-2.ogg", rate: 1 },
  carrier: { file: "horn-1.ogg", rate: 0.82 },
  tractor: { file: "horn-2.ogg", rate: 1.08 },
  jeep: { file: "horn-1.ogg", rate: 1.08 },
  convertible: { file: "horn-2.ogg", rate: 1.28 },
  bus: { file: "horn-2.ogg", rate: 0.72 },
  loader: { file: "horn-1.ogg", rate: 0.72 },
  lincoln: { file: "horn-2.ogg", rate: 0.88 },
  niva: { file: "horn-1.ogg", rate: 1.28 },
  bukhanka: { file: "horn-1.ogg", rate: 0.88 },
  semi: { file: "horn-2.ogg", rate: 0.66 },
};

export function hornSoundFor(chassisId: string): { file: string; rate: number } {
  const sound = HORN_SOUNDS[chassisId];
  if (!sound) throw new Error(`Unknown chassis ${chassisId}`);
  return sound;
}

export function engineFileFor(chassisId: string): string {
  const file = ENGINE_FILES[chassisId];
  if (!file) throw new Error(`Unknown chassis ${chassisId}`);
  return file;
}

const STRAIN_FILES: Record<string, string> = {
  "engine-1.ogg": "engine-strain-2.ogg",
  "engine-2.ogg": "engine-strain-2.ogg",
  "engine-3.ogg": "engine-strain-1.ogg",
};

export function engineStrainFileFor(chassisId: string): string {
  const file = STRAIN_FILES[engineFileFor(chassisId)];
  if (!file) throw new Error(`Engine recording of ${chassisId} has no strained loop`);
  return file;
}

export type SoundFormat = { ext: string; dir: string; mime: string; signature: { at: number; text: string } };

export const BANK = {
  decodeAtOnce: 4,
  tries: 2,
  silentSeconds: 0.1,
  beatSlackSeconds: 0.05,
  decodeMs: 15000,
  formats: [
    { ext: "ogg", dir: "sfx/", mime: "audio/ogg; codecs=opus", signature: { at: 0, text: "OggS" } },
    { ext: "m4a", dir: "sfx-m4a/", mime: 'audio/mp4; codecs="mp4a.40.2"', signature: { at: 4, text: "ftyp" } },
  ] satisfies SoundFormat[],
};

export const MIX = {
  busVolume: { ui: 0.8, sfx: 0.75, ambient: 0.6, music: 0.65 } satisfies Record<Bus, number>,
  level: { ui: -18, sfx: -14, ambient: -24, music: -18 } satisfies Record<Bus, number>,
  compressor: { threshold: -18, knee: 12, ratio: 4, attack: 0.003, release: 0.25 },
  reverb: { seconds: 1.2, decay: 3, wet: 0.12 },
  halfGainMeters: 40,
  panWidth: 0.7,
  engine: { idleRate: 0.8, topRate: 1.3, topSpeedMs: 31.2, idleGain: 0.5, loadMs: 3, revUp: 0.3, revDown: 0.2, loadGain: 0.3, movingMs: 0.5, brakeMs: 4, fadeSeconds: 0.12, overdriveGain: 1.5, strainRelease: 0.5 },
  rev: [
    { at: 0, rate: 0.8, gain: 0 },
    { at: 0.05, rate: 0.85, gain: 0.8 },
    { at: 0.35, rate: 1.7, gain: 1.6 },
    { at: 0.6, rate: 1.75, gain: 1.6 },
    { at: 1.2, rate: 1, gain: 0.6 },
    { at: 1.5, rate: 0.9, gain: 0 },
  ],
  wind: { baseGain: 0.4, stormGain: 1, fadeSeconds: 1 },
  music: { fadeSeconds: 3, musicReachTiles: 12 },
  anchors: { sfx: "cannon-fire" } as Partial<Record<Bus, CueId>>,
  tone: { low: 8, high: -17, spread: 10 },
} as const;

export const SCORE_BLOCKS = {
  arc: {
    blockBars: 2,
    hotHeat: 2.5,
    coolHeat: 1,
    memoryHalfLifeBars: 16,
    memoryWeight: 0.08,
    stay: 6,
    phraseBars: 8,
    next: {
      intro: { verse: 3, wall: 1 },
      verse: { verse: 4, wall: 3, stop: 1 },
      wall: { wall: 4, verse: 2, stop: 1, solo: 1 },
      stop: { verse: 2, wall: 2 },
      solo: { wall: 3, verse: 1 },
    },
    after: {
      "intro>verse": { stop: 0 },
      "intro>wall": { stop: 0 },
      "verse>wall": { wall: 1.5, verse: 0.5 },
      "wall>verse": { wall: 2, stop: 0.5 },
      "wall>stop": { wall: 3 },
      "verse>stop": { verse: 3 },
      "stop>verse": { stop: 0 },
      "stop>wall": { stop: 0 },
      "solo>wall": { solo: 0 },
    },
    hot: { intro: 1, verse: 0.4, wall: 3, stop: 0.7, solo: 1.5 },
    calm: { intro: 1, verse: 2, wall: 0.15, stop: 0.15, solo: 0.15 },
    seamDb: 20,
  },
  songGain: 0.6,
  guitarPush: 0.8,
  guitarAbsentDb: 20,
  cymbalGain: 1,
  cymbalGains: [0.5, 1, 2],
  heatHalfLifeSeconds: 2.5,
  familiarHalfLifeSeconds: 20,
  surpriseHalfLifeSeconds: 1.5,
  surpriseLine: 1,
  weights: { hit: 0.4, miss: 0.2, struck: 0.5, crit: 0.8, crash: 1, sighted: 0.9, knockout: 1.2 },
  nudges: { crash: { wall: 1.5 }, sighted: { wall: 2 }, knockout: { stop: 3 } } as Partial<Record<string, Partial<Record<"intro" | "verse" | "wall" | "stop" | "solo", number>>>>,
  jumpFadeSeconds: 0.03,
  seamSeconds: 0.01,
  aheadSeconds: 1.5,
  startLeadSeconds: 0.1,
  eventLeadSeconds: 0.05,
};
