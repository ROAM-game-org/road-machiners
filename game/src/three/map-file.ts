import { BROWSER_NET, fetchAssetBody, type AssetNet } from '../fetch-asset';
import { MAPGEN } from '../data/terrain';
import { withRoutes } from '../sim/nav/layer';
import { decodeMap, routesFile, type BakedMap } from '../sim/terrain';
import { BUILD_FILES, publicHash, publicUrl, type PublicFiles } from '../public-url';

export async function fetchMap(net: AssetNet = BROWSER_NET, files: PublicFiles = BUILD_FILES): Promise<BakedMap> {
  const [map, routes] = await Promise.all([fetchTerrain(net, files), fetchRoutes(net, files)]);
  return withRoutes(map, routes);
}

async function fetchTerrain(net: AssetNet, files: PublicFiles): Promise<BakedMap> {
  const url = publicUrl(MAPGEN.file, files);
  const first = decodeMap(new Uint8Array((await fetchAssetBody('Map file', url, undefined, net)).bytes));
  const want = publicHash(MAPGEN.file, files);
  if (want === null || first.hash === want) return first;
  const second = decodeMap(new Uint8Array((await fetchAssetBody('Map file', url, { cache: 'reload' }, net)).bytes));
  if (second.hash !== want) throw new Error(`Map file ${MAPGEN.file} arrived as ${second.hash}, this build expects ${want}`);
  return second;
}

async function fetchRoutes(net: AssetNet, files: PublicFiles): Promise<Uint8Array> {
  return new Uint8Array((await fetchAssetBody('Route file', publicUrl(routesFile(MAPGEN.file), files), undefined, net)).bytes);
}
