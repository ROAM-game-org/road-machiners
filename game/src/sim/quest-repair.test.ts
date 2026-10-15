import { describe, expect, it } from 'vitest';
import type { NoteId } from '../data/locals';
import type { CompiledQuest, QuestBundle, QuestLinks, QuestVarDecl } from '../data/quests';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { gameScenes } from '../test/quest-check';
import { newerQuests, repairQuests, type QuestRepair, type SavedRevisions } from './quest-repair';
import { QUESTS } from './quests';
import { defaultSetup } from './settings';
import type { Player, QuestState } from './types';
import { newWorld } from './world';

type Saved = Omit<QuestState, 'live'>;
type QuestSketch = { links?: Partial<QuestLinks>; revision?: number; vars?: Record<string, QuestVarDecl>; checkpoints?: string[] };

const FLAG: QuestVarDecl = { type: 'boolean', init: false };
const STEP: QuestVarDecl = { type: 'number', init: 0 };
const NO_TEXT = { story: '', stats: [], facts: [], scenes: {} };

function quest(sketch: QuestSketch): CompiledQuest {
  const links: QuestLinks = { reads: [], readsNotes: [], writes: {}, notes: [], begins: [], ...sketch.links };
  return { vars: sketch.vars ?? { talked: FLAG }, checkpoints: sketch.checkpoints ?? ['start'], view: 'talk', art: [], revision: sketch.revision ?? 1, links, text: { en: NO_TEXT, ru: NO_TEXT } };
}

function bundleOf(quests: Record<string, QuestSketch>): QuestBundle {
  return {
    world: {
      b_out: { type: 'string', init: 'none' },
      z_out: { type: 'boolean', init: false },
      fate: { type: 'string', init: 'none' },
      intro_step: { type: 'string', init: 'off' },
      wagon_seen: { type: 'boolean', init: false },
    },
    externals: [],
    quests: Object.fromEntries(Object.entries(quests).map(([id, sketch]) => [id, quest(sketch)])),
  };
}

function notesOf(...ids: NoteId[]): Player['notes'] {
  return ids.map((id) => ({ id, turn: 3 }));
}

function saved(state: Partial<Saved>): Saved {
  return { world: {}, local: {}, session: null, ...state };
}

function again(bundle: QuestBundle, revisions: SavedRevisions, repair: QuestRepair): QuestRepair {
  return repairQuests(repair.quests, repair.notes, revisions, bundle);
}

const CHAIN = bundleOf({
  a: { links: { begins: ['b'], notes: ['wagonBowl'] } },
  b: { revision: 2, links: { writes: { b_out: ['done'] }, begins: ['c'] }, vars: { step: STEP }, checkpoints: ['start', 'start.hub'] },
  z: { links: { writes: { z_out: [true] } } },
  c: { links: { reads: ['b_out', 'z_out'], notes: ['greenPit'] } },
});
const CHAIN_STATE = saved({ world: { b_out: 'done' }, local: { a: { talked: true }, b: { step: 3 }, c: { talked: true } }, session: { quest: 'c', checkpoint: 'start', seed: 4 } });
const CHAIN_NOTES = notesOf('wagonBowl', 'greenPit');

describe('repairQuests', () => {
  it('resets a quest whose revision rose and the quests that stand on it, and keeps the one that began it', () => {
    const repair = repairQuests(CHAIN_STATE, CHAIN_NOTES, {}, CHAIN);
    expect(repair.reset).toEqual(['b', 'c']);
    expect(repair.lost).toEqual([]);
    expect(repair.quests).toEqual(saved({ local: { a: { talked: true } } }));
    expect(repair.notes).toEqual(notesOf('wagonBowl'));
  });

  it('reads a save with no revisions as revision 1, and a save at the bundle revision as fitting', () => {
    expect(repairQuests(CHAIN_STATE, CHAIN_NOTES, { b: 2 }, CHAIN).reset).toEqual([]);
    expect(repairQuests(CHAIN_STATE, CHAIN_NOTES, { b: 1 }, CHAIN).reset).toEqual(['b', 'c']);
  });

  it('resets a quest that reads a reset outcome through a read alone', () => {
    const bundle = bundleOf({ b: { revision: 2, links: { writes: { b_out: ['done'] } } }, c: { links: { reads: ['b_out'] } } });
    const repair = repairQuests(saved({ world: { b_out: 'done' }, local: { c: { talked: true } } }), [], {}, bundle);
    expect(repair.reset).toEqual(['b', 'c']);
    expect(repair.quests.world).toEqual({});
  });

  it('keeps a shared outcome another live quest could have written, and resets one only the reset quest writes', () => {
    const bundle = bundleOf({
      bench: { revision: 2, links: { writes: { fate: ['logged'] } } },
      sefa: { links: { writes: { fate: ['sold', 'logged'] }, reads: ['fate'] } },
      kovac: { links: { reads: ['fate'] } },
    });
    const sold = repairQuests(saved({ world: { fate: 'sold' }, local: { bench: { talked: true }, kovac: { talked: true } } }), [], {}, bundle);
    expect(sold.reset).toEqual(['bench']);
    expect(sold.quests.world).toEqual({ fate: 'sold' });
    expect(sold.quests.local).toEqual({ kovac: { talked: true } });

    const onlyBench = bundleOf({ bench: { revision: 2, links: { writes: { fate: ['logged'] } } }, sefa: { links: { writes: { fate: ['sold'] } } }, kovac: { links: { reads: ['fate'] } } });
    const logged = repairQuests(saved({ world: { fate: 'logged' }, local: { kovac: { talked: true } } }), [], {}, onlyBench);
    expect(logged.reset).toEqual(['bench', 'kovac']);
    expect(logged.quests).toEqual(saved({}));
  });

  it('leaves a dependent with no progress alone, and spreads begins only from a broken quest', () => {
    const bundle = bundleOf({
      b: { revision: 2, links: { writes: { b_out: ['done'] } } },
      kovac: { links: { reads: ['b_out'], begins: ['leak'] } },
      idle: { links: { reads: ['b_out'] } },
      leak: { links: { writes: { z_out: [true] } } },
    });
    const repair = repairQuests(saved({ world: { b_out: 'done', z_out: true }, local: { kovac: { talked: true } } }), [], {}, bundle);
    expect(repair.reset).toEqual(['b', 'kovac']);
    expect(repair.quests.world).toEqual({ z_out: true });
  });

  it('never resets a value the game writes, and resets the gate of a scene the game opens with its scene', () => {
    const bundle = bundleOf({
      wagon_seven: { revision: 2, links: { writes: { intro_step: ['done'] } } },
      kovac: { links: { reads: ['wagon_seen'] } },
    });
    const repair = repairQuests(saved({ world: { intro_step: 'done', wagon_seen: true }, local: { wagon_seven: { talked: true }, kovac: { talked: true } } }), [], {}, bundle);
    expect(repair.reset).toEqual(['wagon_seven', 'kovac']);
    expect(repair.quests.world).toEqual({ intro_step: 'done' });
  });

  it('keeps a note the game gives outside quests', () => {
    const bundle = bundleOf({ b: { revision: 2, links: { notes: ['wagonRoad', 'wagonBowl'] } } });
    const repair = repairQuests(saved({ local: { b: { talked: true } } }), notesOf('wagonRoad', 'wagonBowl'), {}, bundle);
    expect(repair.notes).toEqual(notesOf('wagonRoad'));
  });

  it('resets a quest whose variables or open checkpoint no longer fit, as a broken quest', () => {
    const bundle = bundleOf({ b: { links: { begins: ['c'] }, vars: { step: STEP } }, c: { links: { reads: ['b_out'] } }, d: {} });
    const undeclared = repairQuests(saved({ local: { b: { gone: true }, c: { talked: true } } }), [], {}, bundle);
    expect(undeclared.reset).toEqual(['b', 'c']);
    const retyped = repairQuests(saved({ local: { b: { step: 'three' } } }), [], {}, bundle);
    expect(retyped.reset).toEqual(['b']);
    const lostCheckpoint = repairQuests(saved({ local: { d: { talked: true } }, session: { quest: 'd', checkpoint: 'start.gone', seed: 1 } }), [], {}, bundle);
    expect(lostCheckpoint.reset).toEqual(['d']);
    expect(lostCheckpoint.quests).toEqual(saved({}));
  });

  it('drops a quest the game no longer has and a world variable it no longer declares, as lost', () => {
    const bundle = bundleOf({ c: { links: { reads: ['b_out'] } } });
    const repair = repairQuests(saved({ world: { old_var: 1, z_out: 'yes' }, local: { gone: { talked: true }, c: { talked: true } }, session: { quest: 'gone', checkpoint: 'start', seed: 1 } }), [], {}, bundle);
    expect(repair.lost).toEqual(['old_var', 'z_out', 'gone']);
    expect(repair.reset).toEqual([]);
    expect(repair.quests).toEqual(saved({ local: { c: { talked: true } } }));
  });

  it('resets a world value no quest writes, and the quests that read it', () => {
    const bundle = bundleOf({ b: { links: { writes: { b_out: ['done'] } } }, c: { links: { reads: ['b_out'] } } });
    const repair = repairQuests(saved({ world: { b_out: 'ruined' }, local: { c: { talked: true } } }), [], {}, bundle);
    expect(repair.quests).toEqual(saved({}));
    expect(repair.reset).toEqual(['c']);
  });

  it('lets a cycle of writers and readers settle', () => {
    const bundle = bundleOf({
      dag: { revision: 2, links: { reads: ['fate'], writes: { fate: ['told'] } } },
      bench: { links: { reads: ['fate'], writes: { fate: ['logged'] } } },
    });
    const repair = repairQuests(saved({ world: { fate: 'told' }, local: { dag: { talked: true }, bench: { talked: true } } }), [], {}, bundle);
    expect(repair.reset).toEqual(['dag', 'bench']);
  });

  it('touches nothing that already fits, and changes nothing on its own output', () => {
    const fits = repairQuests(CHAIN_STATE, CHAIN_NOTES, { b: 2 }, CHAIN);
    expect(fits).toEqual({ quests: CHAIN_STATE, notes: CHAIN_NOTES, reset: [], lost: [] });
    const repaired = repairQuests(CHAIN_STATE, CHAIN_NOTES, {}, CHAIN);
    expect(again(CHAIN, {}, repaired)).toEqual({ ...repaired, reset: [], lost: [] });
  });

  it('fits a new game and a veteran of every shipped quest', () => {
    const fresh = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
    const [start, veteran] = gameScenes(fresh)('nose_kovac');
    for (const w of [start, veteran]) {
      const state = saved({ world: w.player.quests.world, local: w.player.quests.local, session: w.player.quests.session });
      expect(repairQuests(state, w.player.notes, {}, QUESTS)).toEqual({ quests: state, notes: w.player.notes, reset: [], lost: [] });
    }
  });

  it('throws on a bundle whose links name an unknown quest or variable', () => {
    expect(() => repairQuests(saved({}), [], {}, bundleOf({ a: { links: { begins: ['nobody'] } } }))).toThrow('begins nobody');
    expect(() => repairQuests(saved({}), [], {}, bundleOf({ a: { links: { reads: ['nothing'] } } }))).toThrow('world variable nothing');
  });
});

describe('newerQuests', () => {
  it('names the quests a save holds at a revision above the game', () => {
    expect(newerQuests({ b: 3, a: 1 }, CHAIN)).toEqual(['b']);
    expect(newerQuests({}, CHAIN)).toEqual([]);
  });
});
