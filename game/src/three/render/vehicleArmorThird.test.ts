import { describe, it } from 'vitest';
import { CHASSIS } from '../../data/chassis';
import { armorModelsAreThin, lowNosesCarryRamsLow, ramsAreBacked, armorRisesOverBody, armorSitsOnBody, looseItemsStayOutOfArmor } from './vehicleArmorChecks';

const CHASSIS_IDS = Object.keys(CHASSIS).filter((_, at) => at % 3 === 2);

describe('mounted armor', () => {
  it.each(CHASSIS_IDS)('%s: every armor part sits with its inner face no deeper than the body face minus the inset, touching the real body, and every accessory one armor depth further out only over armor', armorSitsOnBody);

  it('raises every armor part by the rise over the body top', armorRisesOverBody);

  it.each(['convertible', 'lincoln', 'scout'])('%s: a ram stands within a quarter meter of the lowest body edge in its span', lowNosesCarryRamsLow);

  it.each(Object.keys(CHASSIS))('%s: a ram has body behind its foot', ramsAreBacked);

  it.each(CHASSIS_IDS)('%s: no loose part or good reaches into armor by more than the inset plus its own overhang past the body', looseItemsStayOutOfArmor);

  it('has every armor model thin along its local x axis', armorModelsAreThin);
});
