import { t, type Msg } from '../text/msg';
import { unstuckBlock, type UnstuckBlock } from '../sim/unstuck';
import type { World } from '../sim/types';
import { actBlock } from '../sim/world';

const REASONS: Record<UnstuckBlock, Msg> = {
  knockedOut: t('actBlock.knockedOut'),
  towed: t('actBlock.towed'),
  onRadio: t('actBlock.onRadio'),
  gatesShut: t('refusal.gatesShut'),
  combat: t('unstuck.combat'),
  towing: t('unstuck.towing'),
  harpoon: t('unstuck.harpoon'),
};

export function unstuckReason(world: World, busy: boolean, inScene: boolean): Msg | null {
  if (busy) return t('menu.waitForTurn');
  if (inScene) return t('look.inScene');
  const block = unstuckBlock(world);
  return block === null ? null : REASONS[block];
}

export function lookReason(w: World): Msg | null {
  if (w.player.quests.live !== null) return t('look.inScene');
  return actBlock(w) === 'knockedOut' ? t('actBlock.knockedOut') : null;
}
