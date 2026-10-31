import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stepsFrom } from './save';
import type { SavedJson } from './save-migrations';
import { readCarried } from './save-rescue';

const ANCHOR_DIR = join(__dirname, 'save-fixtures/anchors');

type SavedPart = { defId: string; hp: number; wear: number };
type SavedItem = { x: number; y: number; rot: number; kind: string; good?: string; part?: SavedPart };
type SavedWorld = { player: { vehicleId: string; money: number; storage: SavedPart[] }; vehicles: { id: string; chassisId: string; items: SavedItem[] }[] };
type Envelope = { format: { major: number; minor: number }; world: SavedWorld };

const partKey = (part: SavedPart): string => `${part.defId} hp ${part.hp} wear ${part.wear}`;
const itemKey = (it: { kind: string; x: number; y: number; rot: number; good?: string; part?: SavedPart }): string => `${it.kind === 'part' ? partKey(it.part!) : it.good} at ${it.x},${it.y},${it.rot}`;

function steppedWorld(envelope: Envelope): SavedWorld {
  const steps = stepsFrom(envelope.format.minor)!;
  return steps.reduce((world, step) => step(world), structuredClone(envelope.world) as unknown as SavedJson) as unknown as SavedWorld;
}

describe('the rescue carries a roaming truck as the release and tiny steps do', () => {
  it.each(['2-1-roaming.json', '2-6-roaming.json', '2-25-roaming.json', '2-61-roaming.json', '2-62-roaming.json', '2-63-roaming.json'])('puts the player truck, the garage and the money of %s where the step chain does', (file) => {
    const envelope = JSON.parse(readFileSync(join(ANCHOR_DIR, file), 'utf8')) as Envelope;
    const stepped = steppedWorld(envelope);
    const truck = stepped.vehicles.find((v) => v.id === stepped.player.vehicleId)!;
    const carried = readCarried(structuredClone(envelope));

    expect(carried.truck!.chassisId).toBe(truck.chassisId);
    expect(carried.truck!.items.map(itemKey).sort()).toEqual(truck.items.map(itemKey).sort());
    expect(carried.storage.map(partKey).sort()).toEqual(stepped.player.storage.map(partKey).sort());
    expect(carried.money).toBe(stepped.player.money);
  });

  it.each(readdirSync(ANCHOR_DIR).filter((file) => file.endsWith('-highway.json')))('puts the player truck of %s where the step chain does', (file) => {
    const envelope = JSON.parse(readFileSync(join(ANCHOR_DIR, file), 'utf8')) as Envelope;
    const stepped = steppedWorld(envelope);
    const truck = stepped.vehicles.find((v) => v.id === stepped.player.vehicleId)!;

    expect(readCarried(structuredClone(envelope)).truck!.items.map(itemKey).sort()).toEqual(truck.items.map(itemKey).sort());
  });
});
