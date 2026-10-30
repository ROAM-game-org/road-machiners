import { BROWSER_NET, fetchAssetBody, type AssetNet } from '../fetch-asset';
import { MAPGEN } from '../data/terrain';
import { decodeMap, type BakedMap } from '../sim/terrain';
import { BUILD_FILES, publicHash, publicUrl, type PublicFiles } from '../public-url';

export async function fetchMap(net: AssetNet = BROWSER_NET, files: PublicFiles = BUILD_FILES): Promise<BakedMap> {
  const url = publicUrl(MAPGEN.file, files);
  const first = decodeMap(new Uint8Array((await fetchAssetBody('Map file', url, undefined, net)).bytes));
  const want = publicHash(MAPGEN.file, files);
  if (want === null || first.hash === want) return first;
  const second = decodeMap(new Uint8Array((await fetchAssetBody('Map file', url, { cache: 'reload' }, net)).bytes));
  if (second.hash !== want) throw new Error(`Map file ${MAPGEN.file} arrived as ${second.hash}, this build expects ${want}`);
  return second;
}
