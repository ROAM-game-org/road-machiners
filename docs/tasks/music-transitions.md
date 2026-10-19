# Combat music transitions

**Status:** reviewing
**Branch:** music-transitions
**Worktree:** .worktrees/music-transitions
**Goal:** In the music lab and in a `battle` fight, the combat score follows the fight between calm and hot sections with no change a listener can pick out as an edit, and event layers never add parts the current section does not play. The user confirms by ear in the lab on both songs. Useless if: changes are smooth only because the score stops following the fight; jumps pass a numeric check but still sound like edits; the next song added through prep brings cuts back.
**Mode:** interactive

## Context

- The old sequencer drew the next section from weighted tables and cut to its start. A third of those cuts landed on audio unlike what the recording plays next, so they sounded like edits.
- The guitar lane laid the guitar wall's stem over verses with no guitars, and the cymbal lane laid the loudest wall's cymbals over any section.
- Patching single cuts with tighter lines, role bans and longer fades did not converge. The user rejected playing the song only in its own order, since the fight must steer the music.

## Design

- `scripts/score-seams.py` scores every jump from a block end to a block start on the shipped song file: the mel distance of the beat before the cut against the beat before the target, the same for the beat after, and the chroma match of the 4 bars before both. It also lists block ends that fall in near silence.
- `BlockSequencer` plays the recording on and takes a jump only when it is clean: before-beat distance within `jumpDb` and chords within `jumpChords`, or a cut in near silence landing on a section start. At each block end it takes whichever way reaches a wanted section in the fewest bars, and on a tie the copy heard longest ago.
- The wanted sections are set at phrase ends from the peak heat: `hot` roles, `cool` roles, or any. Nudges add their roles.
- Twin jumps cross roles only where a phrase ends or the recording itself changes role.
- Dust and Iron maps every bar the band plays: its second verse and last wall came back, and its stop is the hit and its fade.
- Lanes play only their section's own parts, fade over the last bar, skip solos, and the song level trim is per section. `guitarWall` is gone.
- `jumpDb` 3.5 sits above the 2 dB floor between two plays of one riff. `jumpChords` 0.97 splits on-cycle twins, all 0.97 or more, from off-cycle look-alikes at 0.93 or less.

TDD: no (audio judged by ear; tests pin the sequencer rules, the lane rules and each song's reach)

### Invariants

- IV1 — The sequencer never takes a jump that is not clean.
- IV2 — Every combat song carries a jump score for every block end and block start, and reaches a verse and a wall from any block within 10 blocks.
- IV3 — No lane plays material from another section.

### Assumptions

- AS1 — The jump lines hold for songs added later; the reach test catches a song they leave stuck.

## Verify

- Designer, session and sound tests pass; the reach test fails with `jumpDb` 0.
- Offline renders: jumps dip at most 1.7 dB, like plain block joins. A real-time lab recording showed no silence.
- The user listened in the lab and approved this version.
