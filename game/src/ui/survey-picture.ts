import MANIFEST from '../data/survey-pictures.json';
import { AssetUnreachable, fetchAsset } from '../fetch-asset';
import { publicUrl } from '../public-url';
import { el } from './dom';

const arrivals = new Map<string, Promise<string | null>>();
const arrived = new Map<string, string>();

export function surveyPictureUrl(site: string): string {
  if (!(site in MANIFEST.sites)) throw new Error(`No survey picture for ${site}. Run npm run survey:pictures.`);
  return publicUrl(`survey/${site}.webp`);
}

async function fetchPicture(site: string): Promise<string | null> {
  try {
    const bytes = await fetchAsset('survey-picture', surveyPictureUrl(site));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
    arrived.set(site, url);
    return url;
  } catch (e) {
    if (!(e instanceof AssetUnreachable)) throw e;
    console.warn(`${e.label} ${e.url} did not arrive after ${e.attempts} attempts`);
    return null;
  }
}

function pictureOf(site: string): Promise<string | null> {
  let arrival = arrivals.get(site);
  if (!arrival) {
    arrival = fetchPicture(site);
    arrivals.set(site, arrival);
  }
  return arrival;
}

export function surveyPictureEl(site: string): HTMLElement {
  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'sync';
  img.setAttribute('aria-hidden', 'true');
  const known = arrived.get(site);
  if (known) img.src = known;
  else
    void pictureOf(site).then((url) => {
      if (url) img.src = url;
      else img.hidden = true;
    });
  return el('div', { class: 'survey-picture' }, img);
}
