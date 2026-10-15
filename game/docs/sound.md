# Sound

Sound tells the player what happens without making them read the log: where a shot came from, whether it hit, how hot a fight is. Everything sounds physical and recorded, never digital or arcade, the UI included. This page covers how sound is built, how the combat score behaves, and how to add, generate and tune sounds.

## Where things live

- `src/data/sounds.ts` holds the cue catalog, the prompt styles and every mix number in `MIX`. Tune there.
- `public/sfx/` holds the files, one `<cue>-<n>.ogg` per variant. A test fails when a file has no cue or a cue claims a missing file.
- `public/sfx-m4a/` holds an AAC twin of each file for browsers whose Web Audio refuses Ogg Opus, and `src/data/sound-twins.json` holds the SHA-256 of the `.ogg` each twin came from. `npm run sfx:twins` writes both, and `sfx:import`, `sfx:gen` and `sfx:reimport` run it at their end. A test fails on a missing, stale or orphan twin.
- `src/audio/` is the engine: `mixer.ts` builds the buses, `bank.ts` decodes every file at boot, a few at a time. A file tries each format in turn, and the second try of a format fetches with `cache: 'reload'`, so a bad cached copy cannot defeat it. A file that will not decode as `.ogg` is decoded from its twin, and the first such file makes the bank fetch twins first from then on, with no browser sniffing. A beat cue's buffer is fitted to exactly one loop in either format. A file that fails in every format gets a sibling or silent stand-in instead of stopping the boot. A file the network never delivered only gets a console warning. Each reported failure has a class: `fetch` (an HTTP error status), `bytes` (wrong size or no format signature), `codec` (intact bytes, no support for the format) or `decoder` (intact bytes, decode rejected). Once the page is visible, `recoverBank` decodes each `bytes` and `decoder` failure once more and swaps the real buffer in. Then one error report per class goes out, with the response facts, the browser state, how many recovered, the support answer and the full browser error text per format, `player.ts` plays cues, `pick.ts` holds pure choices, and `designer.ts` picks the combat song's next section.
- `src/three/sound.ts` turns game events into sound: `SoundDirector` for one-shots and score events, and `SoundLoops` for engine, wind and music. `src/three/combat-music.ts` plays the combat songs, `block-session.ts` decides what plays and `block-voices.ts` plays it.
- `scripts/sfx-*.mjs` generate and import files. `scripts/score-blocks-prep.py` turns the combat songs into game files.

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

Each fight plays one whole generated song, cut into 2 bar blocks. The fight moves the song between its sections, and two overlay lanes answer surprises at once. A song is a kit: the full mix, its guitar stem and its cymbals.

Rules the design keeps:

- A block always plays to its end. Sections change only where a phrase ends, every 8 bars, or at the end of an intro, stop or solo.
- One tempo and one key per fight, since every block comes from one recording.
- No per-event sound in the music. Guns and crashes have their own world sounds.
- Events matter by how new they are, not by a fixed list of heavy and light events.

How it plays:

1. The player entering combat, as the HUD combat readout shows it, starts the song. A hostile that only sits or drives by in sight does not. The song was picked at random when the last fight ended, and it stays for the whole fight. Its intro hits at once, since it is the combat cue.
2. Score events are your hits, misses and crits, hits on you, your crashes, your knockouts and an enemy coming into sight. Each adds its weight to heat, a fading sum. At each phrase end the next section is drawn from a table that weighs the section before and the one before that, how hot the fight was since the last choice, and how long each section has played. Hot fights lean to walls and solos, calm fights to verses.
3. Each event also adds surprise, its weight divided by how often that kind came lately. When surprise crosses its line, the guitar lane leans on the song's guitar stem from the next bar, and the cymbal lane opens from the next beat. Both hold to the phrase end.
4. Crashes and sightings nudge the next choice toward a wall, and knockouts toward a stop.
5. Combat ending plays the song's last hit on the next beat.
6. A jump between sections fades over 30 ms. When the target bar starts with a rest, the old block rings on until the new one sounds, so no jump drops into silence.

Score events wait on the turn's play clock and go to the music just before their event, at the current playback speed, so hold-to-fast and slow frames keep them on their shots. A volley's event sits on the round that earns it: the first crit, the first round that strikes, or the first round for a miss. Crash events sit on the physics step of the crash. Knockouts land when the turn's shots land.

To hear a fight without looking for one, open the console with the backquote key and type `battle`. It spawns a random hostile raider near the truck. The score starts once the raider closes in or fires. `__ROAM__.sound.log` in dev lists recent cues and each score event with its heat and surprise, like `score hit heat1.2 surprise0.4`.

To try the score without a game, open `/blocks.html` on the dev server. It runs the game's combat music on one continuous clock. Event buttons fire one event now, Dense turn fires a full turn of them in one second, and Auto fight plays dense turns with or without pauses. The page shows the song in play, the blocks with their joins, both lanes, the events and the heat, and a ledger lists every block with the odds behind it.

To test the score without ears, run `npm run blocks:sim -- --song dusk hit@8 dense@12`. It drives the same session on a simulated clock and prints the blocks, lanes, answers and a summary. `--help` lists the options.

### Combat songs

The songs are generated whole in the ElevenLabs music UI and split locally with Demucs. `scripts/score-songs.json` holds each song's map: its source file, tempo, bar count, the guitar stem that feeds the guitar lane, its sections by bar and its last hit. To add or change a song, put the source wav in `tmp/score-songs/`, edit the map and run:

```bash
uv run --with librosa --with soundfile --with demucs --with torchcodec python -I scripts/score-blocks-prep.py scripts/score-songs.json tmp/score-songs public/sfx src/data/combat-songs.json
npm run sfx:twins
```

Prep splits a song only when its stems are missing. It writes `song-<name>-1.ogg`, its guitars and its cymbals as `song-*` cues, and `src/data/combat-songs.json` with the bar times, bar levels, cymbal level and where each bar's sound starts. Each song also needs its three cues in `DEFS`. It refuses a map whose intro bars or last hit start quiet, and a section with more than 8 silent beats in a row. Song cues load one kit per fight, not at boot with the other sounds.

The heat lines, weights and section table are in `SCORE_BLOCKS` in `src/data/sounds.ts`. The lines come from real fights: in `npm run combat` arena fights the player sees 1 to 3 score events per turn.

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

- Every prompt starts with the `SOUND_STYLE` of the cue's setup, so a set of sounds shares one microphone and place.
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

A cue with a `beat` is a bar-exact loop. It is generated at exactly its bar length with the sound API's loop mode, and import stretches it by under 1% so its sample count is exact. That keeps its beat grid true over any number of repeats. No cue uses it now.
