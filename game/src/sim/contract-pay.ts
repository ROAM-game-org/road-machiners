import { claimPart, claimPartHeld, claimReward } from './claims';
import { escortReward } from './escort-job';
import { claimTravelPay, haulReward, procurePay, searchReward, type Contract } from './market';
import { rescueReward } from './rescue';
import { surveyPay } from './survey';
import type { World } from './types';

export type ContractPay = { reward: number; cratePay?: number };

type PayRule<K extends Contract['kind']> = (world: World, c: Extract<Contract, { kind: K }>) => ContractPay | null;

const PAY: { [K in Contract['kind']]: PayRule<K> } = {
  haul: (_world, c) => ({ reward: haulReward(c) }),
  procure: (_world, c) => procurePay(c.shop, c.good, c.units),
  claim: (world, c) => (claimPartHeld(world, c) === 'stock' ? { reward: claimReward(claimPart(world, c), claimTravelPay(c.shop, c.at)) } : null),
  rescue: (_world, c) => ({ reward: rescueReward(c.shop, c.area) }),
  search: () => ({ reward: searchReward() }),
  survey: (world, c) => ({ reward: surveyPay(world, c.shop, c.points) }),
  escort: (_world, c) => ({ reward: escortReward(c.shop, c.to, c.threat) }),
};

export function contractPay(world: World, c: Contract): ContractPay | null {
  const rule = PAY[c.kind] as PayRule<typeof c.kind>;
  return rule(world, c);
}
