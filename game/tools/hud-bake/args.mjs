export function gameUrlArg() {
  const [url] = process.argv.slice(2);
  if (!url) throw new Error('Pass the running game dev server URL, like http://localhost:5173.');
  return url;
}

export const sheetUrl = (server) => `${server.url}/game/tools/hud-bake/sheet.html`;
