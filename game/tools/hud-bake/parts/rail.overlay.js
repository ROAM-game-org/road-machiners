export default function railOverlay(api) {
  const wrap = api.root.parentElement;
  queueMicrotask(() => wrap.parentElement.prepend(wrap));
}
