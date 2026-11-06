import MANIFEST from '../data/survey-pictures.json';
import { AssetStatusError, AssetUnreachable, fetchAsset } from '../fetch-asset';
import { publicUrl } from '../public-url';
import { el } from './dom';

const arrivals = new Map<string, Promise<string | null>>();
const arrived = new Map<string, string>();

export function pictureUrl(path: string): string | null {
  return arrived.get(path) ?? null;
}

async function download(label: string, path: string): Promise<string | null> {
  try {
    const bytes = await fetchAsset(label, publicUrl(path));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
    arrived.set(path, url);
    return url;
  } catch (e) {
    arrivals.delete(path);
    if (e instanceof AssetUnreachable) console.warn(`${e.label} ${e.url} did not arrive after ${e.attempts} attempts`);
    else if (e instanceof AssetStatusError) console.warn(e.message);
    else throw e;
    return null;
  }
}

export function askPicture(label: string, path: string): Promise<string | null> {
  const known = arrived.get(path);
  if (known) return Promise.resolve(known);
  let arrival = arrivals.get(path);
  if (!arrival) {
    arrival = download(label, path);
    arrivals.set(path, arrival);
  }
  return arrival;
}

export async function preloadPictures(label: string, paths: readonly string[]): Promise<void> {
  for (const path of paths) await askPicture(label, path);
}

export function surveyPicturePath(site: string): string {
  if (!(site in MANIFEST.sites)) throw new Error(`No survey picture for ${site}. Run npm run survey:pictures.`);
  return `survey/${site}.webp`;
}

export function surveyPictureUrl(site: string): string {
  return publicUrl(surveyPicturePath(site));
}

export function surveyPictureEl(site: string): HTMLElement {
  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'sync';
  img.setAttribute('aria-hidden', 'true');
  const path = surveyPicturePath(site);
  const known = pictureUrl(path);
  if (known) img.src = known;
  else
    void askPicture('survey-picture', path).then((url) => {
      if (url) img.src = url;
      else img.hidden = true;
    });
  return el('div', { class: 'survey-picture' }, img);
}
