
import { REGION } from '../data/region';
import { dist, type Vec } from '../sim/vec';
import { siteGap, sitePads, type Site } from '../sim/sites';

export function onSiteOrPad(site: Site, c: Vec): boolean {
  const corner = Math.hypot(REGION.sites.pad.length / 2, REGION.sites.pad.width / 2);
  return siteGap(site, c) <= 0 || sitePads(site).some((pad) => dist(c, pad) <= corner);
}
