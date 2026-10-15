import { describe, expect, it } from 'vitest';
import { buildBadge } from './badges';
import type { Snapshot } from './snapshot';

function card(issue: number, column: string) {
  return { issue, title: `Card ${issue}`, column, blocked: false, releaseTask: false };
}
type Options = { github?: boolean; features?: boolean };
function snapshotWith(options: Options = {}): Snapshot {
  const github = options.github === false ? null : {
    cards: { value: [card(1, 'Triage'), card(2, 'Design'), card(3, 'Implementation'), card(4, 'Hardening'), card(5, 'Approval')], error: null },
  };
  const features = options.features === false ? null : [{ issue: 2, title: 'A' }, { issue: 3, title: 'B' }, { issue: 4, title: 'C' }];
  return {
    github: { value: github, at: null, status: github === null ? 'unavailable' : 'ok' },
    operations: { value: { features }, at: null, status: 'ok' },
  } as unknown as Snapshot;
}

describe('README badges', () => {
  it('counts the next release features and the open cards past triage', () => {
    expect(buildBadge('release', snapshotWith())).toMatchObject({ schemaVersion: 1, label: 'next release', message: '3 features' });
    expect(buildBadge('building', snapshotWith())).toMatchObject({ label: 'building', message: '4 features' });
  });
  it('marks a badge as an error when its data is missing, and knows no other names', () => {
    expect(buildBadge('building', snapshotWith({ github: false }))).toMatchObject({ message: 'unavailable', isError: true });
    expect(buildBadge('snapshot', snapshotWith())).toBeNull();
  });
  it('reads the release badge from operations, so a GitHub failure leaves it alone', () => {
    expect(buildBadge('release', snapshotWith({ github: false }))).toMatchObject({ message: '3 features' });
  });
  it('keeps the building badge when only the release features are missing', () => {
    expect(buildBadge('release', snapshotWith({ features: false }))).toMatchObject({ message: 'unavailable', isError: true });
    expect(buildBadge('building', snapshotWith({ features: false }))).toMatchObject({ message: '4 features' });
  });
});
