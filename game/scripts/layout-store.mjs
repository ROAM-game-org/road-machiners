const READ = () => {
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  };
  const side = document.querySelector('.truck-body .inv-side');
  const store = document.querySelector('.truck-body .inv-store');
  if (!side || !store) return null;
  return {
    a: rect(side),
    b: rect(store),
    beside: document.querySelector('.town-split')?.dataset.store === 'beside',
    storageInCard: Boolean(side.querySelector('.inv-chip, .inv-storage')),
    cardInStorage: Boolean(store.querySelector('.inv-details, .inv-costs, .job-block')),
    clipped: [...store.children].some((box) => box.scrollHeight > box.clientHeight + 1 && getComputedStyle(box).overflowY === 'visible'),
  };
};

const near = (x, y) => Math.abs(x - y) <= 1;
const apart = (a, b) => a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1;
const sameRows = (a, b) => near(a.top, b.top) && near(a.bottom, b.bottom);
const sameColumns = (a, b) => near(a.left, b.left) && near(a.right, b.right);

const RULES = [
  [(s) => s.storageInCard, 'storage sits inside the card screen'],
  [(s) => s.cardInStorage, 'the card sits inside the storage screen'],
  [(s) => !apart(s.a, s.b), 'the card screen and the storage screen overlap'],
  [(s) => s.beside && !sameRows(s.a, s.b), 'beside screens do not share top and bottom'],
  [(s) => !s.beside && !sameColumns(s.a, s.b), 'stacked screens do not share left and right'],
  [(s) => s.clipped, 'the storage screen is shorter than its content'],
];

export async function storeScreenFaults(page) {
  const screens = await page.evaluate(READ);
  if (!screens) return [];
  return RULES.filter(([broken]) => broken(screens)).map(([, text]) => ({ kind: 'hosted-column', path: '', text, sizes: '' }));
}
