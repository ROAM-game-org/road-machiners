# Combat score plays one song in blocks

Status: shipped. The game plays two generated ROAM songs this way. Per-event sounds were dropped from the music: events open a guitar lane and a cymbal lane instead, and guns keep their world sounds. [Sound](../../game/docs/sound.md#combat-score) describes what shipped.
Branch: issue-589
Worktree: .worktrees/issue-589
Goal: A fight sounds like one driving song with the shape of the Jawbreaker map, and the fight moves the song between its sections. A listener in the score lab and in a `battle` fight hears one tempo and one key, with verses, walls, stops and a dead stop at the end. Each shot and crash still has a sound on its event.

Results that would pass the checks and still be useless:

- Blocks join on the grid, but heat never reaches the wall, so every fight is one verse on loop.
- Sections flip every 2 bars as heat crosses its line, which sounds as random as the stabs did.
- Event hits land on time but come from another generation, so they do not sound like the song's drum kit.
- One song for the whole game, so the third fight already sounds stale.
- Seams click or cut off the reverb tail, so each block change sounds like an edit.

## Context

- The score now plays one of four base loops and puts accent stabs on top. Each base is a separate generation: drums at 90 BPM, bass at 110, horns and trombone at 100. The accents were made for 90 BPM.
- A rough librosa key estimate puts the four bases in C# minor, D minor, D# minor and A major. The twelve accent takes spread over D minor, D major, C# minor, A major and D# minor. The prompts all ask for D, and the generator does not follow it.
- Each base is one 8 bar loop with no sections. Pitched stabs play on their event, off the beat, and their tails repeat the stab on the grid of the base.
- `tmp/reference/jawbreaker-map.md` measures the target. It holds one tempo and one key, is built from 2, 4 and 8 bar blocks, and changes only on 2 bar lines. Drive comes from sections: verse, wall, a 2 bar stop with the bass out every 50 to 60 s, one solo, and a dead stop at the end.
- `docs/sound.md` lists what failed before: per-event dice, phrases queued on bar lines as the answer to one event, and tempo that follows heat. Stabs on their event with sparse tails were accepted.
- Game music research agrees on a few rules. Everything shares one key and one tempo grid. Structure moves in fixed blocks and changes only at block ends. Event sounds come from the same small palette as the music. Ape Out picks from a fixed pool of drum patterns, rated by density, by fight heat.
- Demucs stems of the Jawbreaker instrumental already sit in `tmp/demucs/`.
- Fights are short in played time. In the combat harness a fight takes 13 to 40 turns, and 40 is the harness cap. A turn plays 1 s, so a fight plays 13 to 40 s of turns. At 150 BPM that is 8 to 25 bars. Pauses between turns add real time, and no log measures them yet. The music keeps playing through them.

## Design

### 1. One song, cut into blocks

- Each combat song is one generation of about 3 minutes, at one tempo and key. The ElevenLabs music API may take a plan of named sections with a length each, so the prompt can ask for the sections of the Jawbreaker map. This is not checked. `sfx-gen.mjs` sends only a prompt and a length today. Check the API docs, and check that a plan holds the tempo across sections.
- Import measures the beat grid over the whole song, with the method of `scripts/sfx-phase.py`. A take whose beat drifts more than the grid tolerance fails the import.
- Import cuts the song at bar lines into blocks of 2, 4 or 8 bars. Each block keeps its release past its last bar, so it rings over the start of the next block as it would in the song.
- Each block has a role: intro, verse, wall, stop, solo or end. A table in `src/data/sounds.ts` lists each song's blocks with role and bars. The game fails at boot if a block file's length does not match its bars.
- A fight plays one song from start to end. Songs come from a playlist shuffled once per session, like calm music. Two or three songs give enough variety.

### 2. A sequencer picks the next block

- A block always plays to its end. The next block is picked there, so every change lands on a 2 bar line or longer.
- These changes differ from the bar-line phrases that sounded late. No single event asks for a section change. Each event still gets its hit on time, and a section change follows the fight's state over several bars.
- The arc moves on song time, like the reference. Song time is the time the music plays, pauses included. A calm fight still moves from verse to wall, and no fight stays in a verse loop.
- Heat only pulls the next wall earlier and holds a wall longer. It never stops the arc.
- The arc is sized to short fights. A 4 bar intro is followed by verse, and the first wall comes after about 8 bars at the latest. A stop comes about every 16 bars, with the bass out for 2 bars, and then the band comes back at once. The solo plays once, only in a long fight.
- Combat end plays the end block on the next beat, then silence. It does not fade.
- Randomness picks only which take of a role plays. It never picks the role.

### 3. Events play hits from the song's own kit

- Demucs splits each song into stems. Import cuts short unpitched hits from the drum stem: a kick with a crash, a snare flam and a pair of toms. Unpitched hits fit on any moment, so they can keep landing exactly on their event.
- The event timing stays as it is: the play clock, the peak lined up on the event, and the crowding gap.
- Heavy events still add most heat. Heat brings the wall early in a hard fight, and no event forces a change mid-phrase.
- The base ducks only lightly under a hit, since the hits come from the same kit and do not fight the song for space. The score lab sets the amount.

### 4. What goes away

- The four base cues, the six pitched accent cues with their prompts, and the per-base phases in `SCORE_PHASES`.
- The lead and secondary lines, tails, fills and the pause replay in `SoundDesigner`. A block sequencer replaces it. `Fading` heat stays.
- The score lab keeps its buttons and draws blocks with their role instead of tails.

## Order of work

1. Prove the sequencer for free. Cut the Jawbreaker instrumental into blocks by the bars in the map and drive the new sequencer from the score lab. This stays local and is never committed, since the track is not ours.
2. Generate one song after the user approves the credits.
3. Build the import: grid check, block cut, stems and hit cuts.
4. Swap the score in the game. Update `docs/sound.md` and the score memory to the block model.
5. Generate the second and third songs after the first one is accepted.

## Checks

- Each seam has no click and keeps the release of the block before it.
- The beat grid holds over the whole song.
- A scripted battle counts role changes per minute and stops per minute and fails on a flip faster than one block.
- The user listens in the score lab and in a `battle` fight.

## Open questions

- Real fight length. The arc numbers above assume fights of 8 to 25 played bars plus unknown pause time. A few real fights should record song time per fight before the arc is tuned.
- Tempo. Jawbreaker runs at 152 BPM, and our bases run at 90 to 110. A rate near 150 gives the drive of the reference. Hits land on events, so the tempo does not need to match turn length.
- Style. The current prompts ask for tribal power metal with throat singing. The reference is driving rock. The song can keep our style and borrow only the structure.
- Risk. If the API drifts in tempo over 3 minutes, the fallback is one generation per section with the same prompt and tempo. Those sections will match each other less well.
