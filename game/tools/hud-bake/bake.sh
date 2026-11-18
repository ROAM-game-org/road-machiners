#!/bin/sh
set -e
cd "$(dirname "$0")"
: "${HUD_BAKE_SERVER_URL:?HUD_BAKE_SERVER_URL is not set. See game/.env.example.}"
for part in "$@"; do
  node run.mjs "${HUD_BAKE_SERVER_URL%/}/game/tools/hud-bake/part.html?p=$part" "out/$part"
done
