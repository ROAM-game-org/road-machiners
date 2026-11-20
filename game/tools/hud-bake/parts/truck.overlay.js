export default function truckOverlay(api) {
  const { kScale: K, stageCss } = api.meta;
  const picture = api.zone('picture');
  picture.style.background = `url("current.png") ${-stageCss[0] * K}px ${-stageCss[1] * K}px / ${1280 * K}px ${720 * K}px no-repeat`;
}
