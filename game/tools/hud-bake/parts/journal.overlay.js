import { ICONS } from './dash-icons.js';
import { textStyle, closeKey } from './slate.overlay.js';

export default function journalOverlay(api) {
  const items = api.live.items, byCls = (c) => items.find((i) => i.cls.includes(c));
  const title = byCls('panel-title'), close = byCls('close'), line = byCls('dim');
  closeKey(api, close);
  const icon = api.zone('icon', 's-icon');
  icon.innerHTML = ICONS.journal;
  icon.style.color = title.color;
  textStyle(api.zone('title', 's-text'), title);
  textStyle(api.zone('line', 's-text'), line);
}
