import { describe, it } from 'vitest';
import { CHASSIS } from '../../data/chassis';
import { armorModelsAreThin, armorRisesOverBody, armorSitsOnBody, looseItemsStayOutOfArmor } from './vehicleArmorChecks';

const CHASSIS_IDS = Object.keys(CHASSIS).filter((_, at) => at % 3 === 2);

describe('mounted armor', () => {
  it.each(CHASSIS_IDS)('%s: every armor part sits with its inner face no deeper than the body face minus the inset, touching the real body, and every accessory one armor depth further out only over armor', armorSitsOnBody);

  it('raises every armor part by the rise over the body top, or over the body bottom for a ram', armorRisesOverBody);

  it.each(CHASSIS_IDS)('%s: no loose part or good reaches into armor by more than the inset plus its own overhang past the body', looseItemsStayOutOfArmor);

  it('has every armor model thin along its local x axis', armorModelsAreThin);
});
