const BM25_K = 1.2;
const BM25_B = 0.75;
const MIN_WORD = 3;
const STOP_WORDS = new Set('the and for are but not you your can how what when where why who whom which does did has have had was were will would should could with this that these those there here from into about any all get got its our out than then them they their also just like some such very much many more most only own same too off yes'.split(' '));

function wordsOf(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const kept = words.filter((word) => word.length >= MIN_WORD && !STOP_WORDS.has(word));
  return kept.map((word) => (word.length > MIN_WORD + 1 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word));
}

function counted(words: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  return counts;
}

export function rankByWords(texts: string[], query: string, limit: number): number[] {
  const docs = texts.map(wordsOf);
  const counts = docs.map(counted);
  const average = docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, docs.length);
  const asked = [...new Set(wordsOf(query))];
  const weight = new Map(asked.map((word) => {
    const spread = counts.filter((count) => count.has(word)).length;
    return [word, Math.log(1 + (texts.length - spread + 0.5) / (spread + 0.5))];
  }));
  const score = (index: number): number => asked.reduce((sum, word) => {
    const often = counts[index]!.get(word) ?? 0;
    return sum + (weight.get(word)! * often * (BM25_K + 1)) / (often + BM25_K * (1 - BM25_B + (BM25_B * docs[index]!.length) / average));
  }, 0);
  const scored = texts.map((_text, index) => ({ index, score: score(index) }));
  return scored.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((entry) => entry.index);
}
