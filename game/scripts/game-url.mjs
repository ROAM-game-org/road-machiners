export function playUrl(url) {
  const page = new URL(url);
  page.searchParams.set('play', '');
  return page.href;
}
