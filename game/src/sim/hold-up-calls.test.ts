import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { UNITS } from '../data/units';
import { playerVehicle } from './damage';
import { callVehicle, chooseOption, currentOptions, hangUp, raiseCalls } from './dialogue';
import { getUpkeepReserve } from './economy';
import { cashCut, ransomOf } from './haul';
import { addGoods, cargoRoom } from './inventory';
import { isMounted } from './grid';
import { hasCargo } from './salvage';
import { addState, stateOf } from './states';
import { isHostile } from './combat';
import { addVehicle, emptyWorld, forceOption, npcBrain, testDrive } from './testkit';
import { endTurn } from './world';
import { refreshVision } from './vision';
import { lineKey } from '../text/names';
import { entryText } from '../text/resolve';
import type { Vehicle, World } from './types';

const en = (line: Parameters<typeof lineKey>[0]): string => entryText('en', lineKey(line));
const texts = (w: World): string[] => currentOptions(w).map((o) => en(o.line));
const PAY = "Here's your money. Now back off.";
const DROP = 'Fine. Take it.';
const REFUSE = 'Come and get it.';

function pick(w: World, text: string): World {
  const i = texts(w).indexOf(text);
  if (i < 0) throw new Error(`No option "${text}" in ${texts(w).join(' | ')}`);
  return chooseOption(w, i);
}

function ambush(cargo: boolean, fullRobber = false): { w: World; raider: Vehicle } {
  const w = emptyWorld({ x: 30, y: 30 });
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  if (cargo) addGoods(w, playerVehicle(w), 'scrap', 2);
  else bare(w);
  const raider = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine', 'mg'], { x: 40, y: 30 }, Math.PI);
  raider.brain = npcBrain('buggy', raider.pos, ['raider']);
  raider.resources!.money = 0;
  if (fullRobber) while (cargoRoom(raider) > 0) addGoods(w, raider, 'scrap', 1);
  forceOption('hostileSeen', 'fight');
  forceOption('mugging', 'demand');
  return { w, raider };
}

function bare(w: World): void {
  const me = playerVehicle(w);
  me.items = me.items.filter((item) => item.kind === 'part' && isMounted(me.chassisId, item));
}

const raiderIn = (w: World, id: string): Vehicle => w.vehicles.find((v) => v.id === id)!;

describe('a demand with a price', () => {
  it('shows drop, pay and refuse, and paying keeps the cargo and moves the price', () => {
    const { w: start, raider } = ambush(true);
    const w = endTurn(start, testDrive);
    expect(w.player.call).toMatchObject({ with: raider.id, topic: 'demand' });
    expect(texts(w)).toEqual([DROP, PAY, REFUSE, 'Hang up.']);
    const price = ransomOf(w, raiderIn(w, raider.id), playerVehicle(w)).money;
    const before = w.player.money;
    const next = pick(w, PAY);
    expect(before - next.player.money).toBe(price);
    expect(raiderIn(next, raider.id).resources!.money).toBe(price);
    expect(hasCargo(playerVehicle(next))).toBe(true);
    expect(next.salvage.some((s) => s.id.startsWith('cargo-'))).toBe(false);
    expect(isHostile(next, raiderIn(next, raider.id), playerVehicle(next))).toBe(false);
    expect(next.player.talked[raider.id]?.demand).toBe('agreed');
    expect(next.events.filter((e) => e.t === 'holdUp')).toEqual([{ t: 'holdUp', robber: raider.id, victim: playerVehicle(next).id, paid: 'money', value: price }]);
  });

  it('hides the pay answer when the player cannot afford the price', () => {
    const { w: start } = ambush(true);
    start.player.money = 0;
    const w = endTurn(start, testDrive);
    expect(texts(w)).toEqual([DROP, REFUSE, 'Hang up.']);
  });

  it('dropping the cargo still works and moves no money', () => {
    const { w: start } = ambush(true);
    const before = start.player.money;
    const w = endTurn(start, testDrive);
    const next = pick(w, DROP);
    expect(next.player.money).toBe(before);
    expect(hasCargo(playerVehicle(next))).toBe(false);
  });
});

describe('a cash-only demand', () => {
  it('is raised by a robber that can load nothing, once, and names only the cut', () => {
    const { w: start, raider } = ambush(true, true);
    const w = endTurn(start, testDrive);
    expect(w.player.call).toMatchObject({ with: raider.id, topic: 'demandCut' });
    expect(texts(w)).toEqual([PAY, REFUSE, 'Hang up.']);
    const cut = cashCut(w, playerVehicle(w));
    expect(w.player.call!.vars.price).toEqual({ kind: 'money', amount: cut });
    const refused = pick(w, REFUSE);
    expect(refused.player.talked[raider.id]?.demand).toBe('refused');
    for (let i = 0; i < 6; i++) {
      const next = endTurn(refused, testDrive);
      expect(['demand', 'demandCut']).not.toContain(next.player.call?.topic);
      refused.player.call = null;
    }
  });

  it('paying takes the cut, leaves the player its fuel and supplies money and ends the fight', () => {
    const { w: start, raider } = ambush(false);
    const w = endTurn(start, testDrive);
    expect(w.player.call).toMatchObject({ topic: 'demandCut' });
    const before = w.player.money;
    const next = pick(w, PAY);
    expect(before - next.player.money).toBe(cashCut(w, playerVehicle(w)));
    expect(next.player.money).toBeGreaterThanOrEqual(getUpkeepReserve(playerVehicle(next)));
    expect(stateOf(next, 'truce', raider.id, next.player.vehicleId)).not.toBeNull();
    expect(next.player.talked[raider.id]?.demand).toBe('agreed');
  });

  it('is never raised against a player with nothing above the reserve', () => {
    const { w: start } = ambush(false);
    start.player.money = getUpkeepReserve(playerVehicle(start));
    const w = endTurn(start, testDrive);
    expect(w.player.call?.topic).not.toBe('demandCut');
  });

  it('takes no money from a knocked-out truck', () => {
    const { w: start, raider } = ambush(false);
    const w = endTurn(start, testDrive);
    w.player.call = null;
    const out = structuredClone(w);
    out.vehicles.find((v) => v.id === raider.id)!.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [], gaveUp: true };
    raiseCalls(out);
    expect(out.player.call).toBeNull();
    expect(out.player.money).toBe(w.player.money);
  });
});

describe('a robber truce with a price', () => {
  function holdup(cargo: boolean): { w: World; robber: Vehicle } {
    const w = emptyWorld({ x: 30, y: 30 });
    for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
    if (cargo) addGoods(w, playerVehicle(w), 'scrap', 2);
    else bare(w);
    const robber = addVehicle(w, 'independent', 'buggy', ['stockEngine', 'mg'], { x: 40, y: 30 }, Math.PI);
    robber.brain = npcBrain('scavenger', robber.pos, ['scavenger', 'scumbag']);
    robber.resources!.money = 0;
    for (const y of [28, 32]) addVehicle(w, 'independent', 'buggy', ['stockEngine', 'mg'], { x: 40, y }, Math.PI).brain = npcBrain('scavenger', { x: 40, y }, ['scavenger']);
    addState(w, 'feud', robber.id, w.player.vehicleId, { kind: 'feud', robbery: true });
    addState(w, 'feud', w.player.vehicleId, robber.id, { kind: 'feud', robbery: false });
    refreshVision(w);
    return { w, robber };
  }
  const askTruce = (w: World, id: string): World => {
    let next = callVehicle(w, id);
    next = pick(next, 'Enough shooting. Can we call a truce?');
    return pick(next, 'We both drive away.');
  };

  it('with cargo, pays the price and keeps the cargo', () => {
    const { w, robber } = holdup(true);
    const open = askTruce(w, robber.id);
    expect(open.player.call?.node).toBe('tollCargo');
    const price = ransomOf(open, raiderIn(open, robber.id), playerVehicle(open)).money;
    const next = pick(open, PAY);
    expect(w.player.money - next.player.money).toBe(price);
    expect(hasCargo(playerVehicle(next))).toBe(true);
    expect(isHostile(next, raiderIn(next, robber.id), playerVehicle(next))).toBe(false);
    expect(next.player.talked[robber.id]?.demand).toBe('agreed');
  });

  it('with no cargo, names the cut alone and pays it', () => {
    const { w, robber } = holdup(false);
    const open = askTruce(w, robber.id);
    expect(open.player.call?.node).toBe('tollCut');
    expect(texts(open)).toEqual([PAY, REFUSE, 'Hang up.']);
    const next = pick(open, PAY);
    expect(w.player.money - next.player.money).toBe(cashCut(w, playerVehicle(w)));
    expect(isHostile(next, raiderIn(next, robber.id), playerVehicle(next))).toBe(false);
  });
});

describe('mercy with a price', () => {
  function atWar(cargo: boolean): { w: World; npc: Vehicle } {
    const w = emptyWorld({ x: 30, y: 30 });
    for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
    if (cargo) addGoods(w, playerVehicle(w), 'scrap', 2);
    else bare(w);
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine', 'mg'], { x: 36, y: 30 });
    npc.brain = npcBrain('trader', npc.pos, ['scavenger']);
    npc.resources!.money = 0;
    addState(w, 'feud', npc.id, w.player.vehicleId, { kind: 'feud', robbery: false });
    addState(w, 'feud', w.player.vehicleId, npc.id, { kind: 'feud', robbery: false });
    refreshVision(w);
    return { w, npc };
  }

  it('lets the player pay the price instead of dropping the cargo', () => {
    forceOption('mercyBegged', 'spare');
    const { w: start, npc } = atWar(true);
    let w = pick(callVehicle(start, npc.id), 'I give up. Let me go.');
    w = pick(w, 'Take what I carry. Just let me drive away.');
    expect(texts(w)).toEqual([DROP, PAY, 'Hang up.']);
    const next = pick(w, PAY);
    expect(hasCargo(playerVehicle(next))).toBe(true);
    expect(start.player.money - next.player.money).toBeGreaterThan(0);
    expect(isHostile(next, raiderIn(next, npc.id), playerVehicle(next))).toBe(false);
  });

  it('asks only the cut of a player with no cargo, and hanging up withdraws the plea', () => {
    forceOption('mercyBegged', 'spare');
    const { w: start, npc } = atWar(false);
    let w = pick(callVehicle(start, npc.id), 'I give up. Let me go.');
    w = pick(w, 'Take what I carry. Just let me drive away.');
    expect(w.player.call?.node).toBe('sparedCut');
    const hung = hangUp(structuredClone(w));
    expect(hung.player.money).toBe(start.player.money);
    expect(isHostile(hung, raiderIn(hung, npc.id), playerVehicle(hung))).toBe(true);
    const next = pick(w, PAY);
    expect(start.player.money - next.player.money).toBe(cashCut(start, playerVehicle(start)));
  });
});

describe('a call saved before the price existed', () => {
  it('loads, shows drop and refuse, and answers without a price', () => {
    const { w: start, raider } = ambush(true);
    const w = endTurn(start, testDrive);
    const old = structuredClone(w);
    const haul = old.player.call!.vars.haul!;
    old.player.call!.vars = { haul };
    old.player.call!.line = { line: 'demandCargo', vars: { haul } };
    const loaded: World = JSON.parse(JSON.stringify(old));
    expect(loaded.player.call).toMatchObject({ with: raider.id, topic: 'demand' });
    expect(texts(loaded)).toEqual([DROP, REFUSE, 'Hang up.']);
    const next = pick(loaded, DROP);
    expect(hasCargo(playerVehicle(next))).toBe(false);
  });
});

describe('robbing a driver for M', () => {
  const ASK = "Hand over your M's, or we open fire.";
  const INSIST = "You heard me. M's, now.";
  const CARGO_ASK = 'Drop your cargo, or we open fire.';

  function rich(money: number): { w: World; npc: Vehicle } {
    const w = emptyWorld({ x: 30, y: 30 });
    for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine', 'mg'], { x: 36, y: 30 });
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    npc.resources!.money = money;
    addGoods(w, npc, 'scrap', 2);
    refreshVision(w);
    return { w, npc };
  }

  it('a complying driver pays the cut and keeps its reserve', () => {
    forceOption('threatened', 'comply');
    const { w: start, npc } = rich(getUpkeepReserve(addVehicle(emptyWorld(), 'independent', 'scout', ['stockEngine'], { x: 1, y: 1 })) + 100000);
    const cut = cashCut(start, raiderIn(start, npc.id));
    expect(cut).toBeGreaterThan(0);
    const me = start.player.money;
    const next = pick(pick(callVehicle(start, npc.id), ASK), INSIST);
    expect(next.player.money - me).toBe(cut);
    const after = raiderIn(next, npc.id);
    expect(after.resources!.money).toBeGreaterThanOrEqual(getUpkeepReserve(after));
    expect(hasCargo(after)).toBe(true);
    expect(stateOf(next, 'truce', npc.id, next.player.vehicleId)).not.toBeNull();
  });

  it('a driver with nothing above its reserve pays nothing and still holds the truce', () => {
    forceOption('threatened', 'comply');
    const { w: start, npc } = rich(0);
    const me = start.player.money;
    const next = pick(pick(callVehicle(start, npc.id), ASK), INSIST);
    expect(next.player.money).toBe(me);
    expect(next.player.call?.node).toBe('empty');
    expect(stateOf(next, 'truce', npc.id, next.player.vehicleId)).not.toBeNull();
  });

  it('a defiant driver feuds', () => {
    forceOption('threatened', 'fightBack');
    const { w: start, npc } = rich(100000);
    const next = pick(pick(callVehicle(start, npc.id), ASK), INSIST);
    expect(stateOf(next, 'feud', npc.id, next.player.vehicleId)).not.toBeNull();
  });

  it('shares one limit with the cargo robbery, both ways', () => {
    forceOption('threatened', 'comply');
    const { w: start, npc } = rich(100000);
    const after = hangUp(pick(callVehicle(start, npc.id), ASK));
    expect(texts(callVehicle(after, npc.id))).not.toContain(CARGO_ASK);
    const { w: other, npc: second } = rich(100000);
    const cargoFirst = hangUp(pick(callVehicle(other, second.id), CARGO_ASK));
    expect(texts(callVehicle(cargoFirst, second.id))).not.toContain(ASK);
  });

  it('is not offered to a driver in a feud', () => {
    const { w, npc } = rich(100000);
    addState(w, 'feud', npc.id, w.player.vehicleId, { kind: 'feud', robbery: false });
    expect(texts(callVehicle(w, npc.id))).not.toContain(ASK);
  });
});

describe('the cent math', () => {
  it('names whole M', () => {
    const { w } = ambush(false);
    expect(cashCut(w, playerVehicle(w)) % UNITS.centsPerM).toBe(0);
  });
});
