# Sound

Sound tells the player what happens without making them read the log: where a shot came from, whether it hit, how hot a fight is. Everything sounds physical and recorded, never digital or arcade, the UI included. This page covers how sound is built, how the combat score behaves, and how to add, generate and tune sounds.

## Where things live

- `src/data/sounds.ts` holds the cue catalog, the prompt styles and every mix number in `MIX`. Tune there.
- `public/sfx/` holds the files, one `<cue>-<n>.ogg` per variant. A test fails when a file has no cue or a cue claims a missing file.
- `public/sfx-m4a/` holds an AAC twin of each file for browsers whose Web Audio refuses Ogg Opus, and `src/data/sound-twins.json` holds the SHA-256 of the `.ogg` each twin came from. `npm run sfx:twins` writes both, and `sfx:import`, `sfx:gen` and `sfx:reimport` run it at their end. A test fails on a missing, stale or orphan twin.
- `src/audio/` is the engine: `mixer.ts` builds the buses, `bank.ts` decodes every file at boot, a few at a time. A file tries each format in turn, and the second try of a format fetches with `cache: 'reload'`, so a bad cached copy cannot defeat it. A file that will not decode as `.ogg` is decoded from its twin, and the first such file makes the bank fetch twins first from then on, with no browser sniffing. A beat cue's buffer is fitted to exactly one loop in either format. A file that fails in every format gets a sibling or silent stand-in instead of stopping the boot. A file the network never delivered only gets a console warning. Each reported failure has a class: `fetch` (an HTTP error status), `bytes` (wrong size or no format signature), `codec` (intact bytes, no support for the format) or `decoder` (intact bytes, decode rejected). Once the page is visible, `recoverBank` decodes each `bytes` and `decoder` failure once more and swaps the real buffer in. Then one error report per class goes out, with the response facts, the browser state, how many recovered, the support answer and the full browser error text per format, `player.ts` plays cues, `pick.ts` holds pure choices, and `designer.ts` times the combat accents.
- `src/three/sound.ts` turns game events into sound: `SoundDirector` for one-shots, `SoundLoops` for engine, wind and music, and `CombatScore` for the combat music.
- `scripts/sfx-*.mjs` generate and import files. `scripts/sfx-phase.py` measures beat loops.

## The mix

Four buses feed the master: `ui`, `sfx`, `ambient` and `music`. Each has a player-set volume and a low-pass filter. The `sfx` bus also runs through a compressor and a short open-air reverb, so sounds from different sources sit in one place.

- World sounds, like guns, hits and crashes, play where they happen. Pan follows the screen position, and level halves at `MIX.halfGainMeters` from the camera focus. They use the same points as the visual effects, so fog of war silences what the player cannot see.
- Each turn plays at most one result sting, the most important one: level-up, discovery or money. A knockout is an attention alert and has no sting.
- The engine is one recorded loop per chassis. Its pitch and level follow speed over the turn, so speeding up revs and braking drops. Continuous sounds are always bent loops like this, never short clips per state. While heat damages the engine, the loop crossfades to a strained loop, one for light trucks and one for heavy ones, started with it and bent the same way, and falls back to the healthy note over two turns once the damage stops.
- A hard slowdown adds the air brake where the truck is. Passing or reaching an order point makes no sound of its own.
- Wind rises near dust storms.
- Calm music plays out of combat, from a playlist shuffled once per session. After each fight it comes back as the next track, so every track plays before any repeats.
- Town music replaces calm music while the player is within guard range of a town gate. Outpost music does the same near the gates of outposts, the trading stalls that are not towns. Abandoned music plays inside territories, the abandoned places like Fallen Sun and Old Orchard. Each entry starts the next track of a playlist shuffled once per session. Combat music plays over all of them.
- Quest music plays over all music, combat included, while the quest screen is open. Each quest starts the next track of a playlist shuffled once per session. It is never muffled in a pause, since the player reads while no turn plays.
- Between turns, once no turn has played for `MIX.music.pauseDelayMs`, the music bus is muffled a little. The delay keeps the gaps between automatic turns clear.

The volume knobs and the mute switch sit on the radio panel above the log. The whole column under a knob is its handle. Drag it up or right to raise the volume and down or left to lower it, 160px for the whole range. The label shows the level while you use the knob. The wheel and the focused arrow keys turn it in 5% steps. A next key above the radio's screen crossfades to another calm track. The knob and mute settings are stored in local storage. A knob the player never turned follows `MIX.busVolume`, so a new default reaches everyone who kept the old one.

## Combat score

Combat music is built live from a base loop and short accents, so each fight sounds like one song that reacts to the fight. It keeps a fixed structure with a little variety inside, few sounds, and each sound tied to its event:

- No per-event dice, like chance rolls, recalled accents or random mode changes. They make it sound random.
- No phrases queued to start on bar lines. They sound late and detached from their events.
- No tempo change with the fight's intensity. It feels chaotic.

How it plays:

1. The player entering combat, as the HUD combat readout shows it, starts a battle. A hostile that only sits or drives by in sight does not. One random base loop plays, drums, bass, horns or trombone, from its first beat. It stops when that combat ends.
2. Heat is a fading sum of event weights. It sets the base's level and muffle once per bar, so a quiet fight sounds low and dull and a hot one sounds full and open.
3. Each event plays a stab: its accent, started early by the take's measured peak, so the loudest moment lands exactly when the shot lands or the crash happens.
4. A short tail of the same accent may follow on the beat grid, from the half-beat nearest the event. Calm tails are the stab alone. Hot tails add one hit.
5. Heavy events, like a crash, a crit, a sighting or being hit, go to the lead line, centered, and always sound. Light events, your hits and misses, go to the secondary line: quieter, to one side, and only by chance.
6. A stab too soon after another on its line is dropped, so a burst makes one sound, not a pile.
7. In a turn pause, the last lead phrase repeats once from a bar line, then only the base plays.
8. Outside a battle, accents are ignored, so a crash in peacetime makes only its normal crash sound.

Randomness only changes how a sound plays: which take, which rhythm variant, a rare fill, a few milliseconds of timing and a little level. It never changes when the structure moves.

Volley accents are timed from the volley's own plan, when the first round lands. Crash accents are known at turn start, so their peak lands on the physics step of the crash. Crash sparks and sound play when playback reaches that step. A collision with no physics step, like a far truck breaking a fence, plays when movement ends.

To hear a fight without looking for one, open the console with the backquote key and type `battle`. It spawns a random hostile raider near the truck. The score starts once the raider closes in or fires. `__ROAM__.sound.log` in dev lists recent cues and what the score did with each accent, like `accent-hit skipped heat1.2`.

## Adding a sound

1. Add a cue to `DEFS` in `src/data/sounds.ts`: its bus, volume, voices and loop flag, and for generation a `setup` and prompts.
2. Import files with `npm run sfx:import -- <cue> <file...>`, or generate them. Import makes every file one format and loudness per bus. It trims one-shots, keeps loops seamless, and matches each variant's tone to the cue's first file.
3. Play it from `src/three/sound.ts`. A world sound goes through `SoundDirector.at()` with its position.
4. Listen with `npm run sfx:board`, which plays every cue through the game's mixer, beside a reference cue for buses that have one in `MIX.anchors`.

A cue with several prompts is a family of different sounds, one prompt per variant, and skips tone matching.

Every music loop also gets the palette finish at import, so tracks from different generations sound like one set. Its tone moves part of the way toward one target curve, taken from the town and outpost tracks. Its stereo width goes to one level. All loops share the same glue compression, one short room and one soft top end. The settings are at the end of `scripts/sfx-lib.mjs`. The finish changes timing by a few milliseconds, so measure the phase of a combat base again after it.

World one-shots, the `sfx` cues with the `field` setup that do not loop, get two more steps at import, so they sound like one place:

- A gentle cut above 8 kHz puts every take at the 10 m the prompt asks for. Generated takes come out close and bright.
- Bass and treble move back to within `MIX.tone.spread` of the anchor's tone in `MIX.tone`. A cut may go up to 12 dB and a boost up to 6 dB, since a boost also raises noise.

`npm run sfx:report` lists every world one-shot's loudness and tone beside the anchor. It flags the takes that import could not bring into range. Fix those by hand, as [Fixing a take](#fixing-a-take) shows.

## Generating with ElevenLabs

`npm run sfx:gen -- <cue> <count>` generates variants and imports them. It costs credits, so ask before running it. `SFX_MAX_GENERATIONS` in `.env` caps one run.

- Every prompt starts with the `SOUND_STYLE` of the cue's setup, so a set of sounds shares one microphone and place. Combat accents use the `stinger` style, and base loops use `score`.
- Prompt style plus subject must stay under 450 characters, or the API refuses it.
- Generated heavy sounds come out thin. Check the spectrogram and fix the take as [Fixing a take](#fixing-a-take) shows, rather than generating again.
- Raw takes stay in `tmp/sfx-raw/`, and each file's tag names its source. After an import change, `npm run sfx:reimport` rebuilds every file from those sources. `npm run sfx:reimport -- field` rebuilds only the world one-shots, and cue names rebuild those cues.

## Fixing a take

A near-miss take is cheaper to fix with ffmpeg or Demucs than to generate again. Write the fixed file next to the raw take in `tmp/sfx-raw/` and import that file, so reimport rebuilds from it.

- A thin heavy sound, like a horn or a harpoon, gets pitched down with `asetrate=44100*0.85,aresample=44100` and a bass boost like `bass=g=6:f=120`. Pitch down more for a bigger sound.
- A bright hiss gets two low-passes, like `lowpass=f=3000,lowpass=f=3000`.
- A music take that is too loud or bright gets a high-shelf cut like `treble=g=-3:f=4000` and glue compression.
- A slowdown over about 6% sounds artificial. Generate again for a bigger tempo change.
- Clanks or rustle in a music take come from its drums. Split it into stems with Demucs, muffle the drums stem with a low-pass and mix the stems back with `amix=inputs=4:normalize=0`. Run Demucs with `-d cpu` on a Mac, since the GPU backend fails on it.

```bash
uvx --python 3.11 --from demucs --with "torch<2.6" --with "torchaudio<2.6" --with soundfile demucs -d cpu -n htdemucs -o tmp/demucs <take.mp3>
```

## Beat loops

A cue with a `beat` is a bar-exact loop. It is generated at exactly its bar length with the sound API's loop mode, and import stretches it by under 1% so its sample count is exact. That keeps its beat grid true over any number of repeats.

A new beat loop needs its first-beat offset before the game will play it:

```bash
uv run --with librosa python scripts/sfx-phase.py 32 public/sfx/score-bass-1.ogg
```

The first argument is the loop's beats, bars times 4. Put the printed phase in `SCORE_PHASES`. On-grid strength well above the mean shows the loop holds its tempo. A combat base needs exactly one file.

Accents are cut to 1.5 s at import, with soft edges and a warmer top end, so they sit inside the music instead of cutting in.
