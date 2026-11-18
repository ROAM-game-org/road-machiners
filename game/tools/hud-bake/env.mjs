const need = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See game/.env.example.`);
  return value;
};
export const SERVER_URL = need('HUD_BAKE_SERVER_URL').replace(/\/$/, '');
export const GAME_URL = need('HUD_BAKE_GAME_URL').replace(/\/$/, '');
export const SHEET_URL = `${SERVER_URL}/game/tools/hud-bake/`;
