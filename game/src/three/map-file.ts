import { downloadBody, type DownloadDeps } from '../download';
import { MAPGEN } from '../data/terrain';
import { decodeMap, type BakedMap } from '../sim/terrain';
import { BUILD_FILES, publicHash, publicUrl, type PublicFiles } from '../public-url';

export async function fetchMap(deps: DownloadDeps = {}, files: PublicFiles = BUILD_FILES): Promise<BakedMap> {
  const url = publicUrl(MAPGEN.file, files);
  const first = decodeMap(new Uint8Array((await downloadBody(url, undefined, deps)).bytes));
  const want = publicHash(MAPGEN.file, files);
  if (want === null || first.hash === want) return first;
  const second = decodeMap(new Uint8Array((await downloadBody(url, { cache: 'reload' }, deps)).bytes));
  if (second.hash !== want) throw new Error(`Map file ${MAPGEN.file} arrived as ${second.hash}, this build expects ${want}`);
  return second;
}
