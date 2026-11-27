export type LaunchEnv = Readonly<Record<string, string | undefined>>;

export function startsFullscreen(env: LaunchEnv, argv: readonly string[]): boolean {
  if (argv.includes('--windowed')) return false;
  return argv.includes('--fullscreen') || env.SteamDeck === '1' || env.SteamGamepadUI === '1';
}
