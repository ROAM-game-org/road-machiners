import { afterEach, beforeAll, expect, it } from 'vitest';
import { startKit } from '../data/start';
import { playerVehicle } from '../sim/damage';
import { corePart } from '../sim/grid';
import type { QuestLanguage } from '../data/quests';
import { setQuestLanguage } from '../sim/quests';
import { defaultSetup } from '../sim/settings';
import { addVehicle } from '../sim/testkit';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { buildDrive, captureDrive, freeDrive, initPhysics } from './drive';
import { computeRequestedTurn } from './turn';

beforeAll(initPhysics);
afterEach(() => setQuestLanguage('en'));

function knockoutTurn(questLanguage: QuestLanguage) {
  const world = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
  const me = playerVehicle(world);
  const raider = addVehicle(world, 'independent', 'buggy', [], { x: me.pos.x + 6, y: me.pos.y });
  me.lastHitBy = raider.id;
  corePart(me, 'cab').hp = 0;
  const drive = buildDrive(world);
  try {
    const { terrain, ...state } = world;
    const request = { kind: 'turn' as const, id: 1, questLanguage, tailSteps: 11, world: state, drive: captureDrive(drive), terrain };
    return computeRequestedTurn(request, terrain).world;
  } finally {
    freeDrive(drive);
  }
}

it.each(['ru', 'en'] as const)('opens the knockout quest in %s because the request says so', (language) => {
  setQuestLanguage(language === 'ru' ? 'en' : 'ru');
  const world = knockoutTurn(language);
  expect(world.player.state).toBe('knockedOut');
  expect(world.player.quests.live?.lang).toBe(language);
}, 60_000);
