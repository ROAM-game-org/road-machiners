import { mkdirSync, writeFileSync } from 'node:fs';
import { EFFORT } from '../src/data/market.ts';
import { heldSearch, rollContract, searchCandidates, shopAt, siteOf } from '../src/sim/market.ts';
import { recordTurns } from '../src/sim/progression/record-node.ts';
import { measuredRewardTurns, searchEffort, turnLine } from '../src/sim/progression/turn-log.ts';

const USAGE = 'Usage: npm run search:effort -- --seed <n> --turns <n> [--post-until <turn>] [--out tmp/search-effort]';
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a !== '--').flatMap((a, i, all) => (a.startsWith('--') ? [[a.slice(2), all[i + 1]]] : [])));
const seed = Number(flags.seed);
const turns = Number(flags.turns);
if (!Number.isInteger(seed) || !Number.isInteger(turns) || turns <= 0) throw new Error(USAGE);
const postUntil = flags['post-until'] === undefined ? Math.max(0, turns - 300) : Number(flags['post-until']);
const out = flags.out ?? 'tmp/search-effort';
mkdirSync(out, { recursive: true });

function post(world) {
  const shopId = shopAt(world);
  if (!shopId || heldSearch(world) || world.turn > postUntil) return null;
  const board = world.shops[shopId].contracts;
  if (board.some((c) => c.kind === 'search')) return null;
  const sought = searchCandidates(world, shopId, world.shops[shopId]);
  if (sought.length === 0) return null;
  const contract = rollContract(world, { id: shopId, pos: siteOf(shopId).pos }, [], [], [], [], sought);
  board.push(contract);
  return { turn: world.turn, shop: shopId, target: contract.target };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function save(lines, posts) {
  const effort = searchEffort(lines);
  const rewardTurns = effort.efforts.length > 0 ? measuredRewardTurns(median(effort.efforts), effort.runningCost) : null;
  const summary = { seed, turns: lines.at(-1)?.t ?? 0, postUntil, wage: EFFORT.wage[1], posts, effort, rewardTurns };
  writeFileSync(`${out}/searcher-${seed}.json`, `${JSON.stringify(summary, null, 1)}\n`);
  return summary;
}

const lines = [];
const posts = [];
for (const step of recordTurns(seed, 'searcher', turns)) {
  lines.push(turnLine(step.world, step.events, step.ledger));
  const posted = post(step.world);
  if (posted) posts.push(posted);
  if (step.world.turn % 25 === 0) save(lines, posts);
}
const summary = save(lines, posts);
console.log(`searcher-${seed}: ${summary.turns} turns, ${posts.length} searches posted, ${summary.effort.claimed} claimed, efforts ${summary.effort.efforts.join(', ') || 'none'}, running cost ${summary.effort.runningCost.toFixed(1)} cents a turn, rewardTurns ${summary.rewardTurns ?? 'none'}`);
