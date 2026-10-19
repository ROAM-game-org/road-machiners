import { t, type Msg } from "../text/msg";
import type { World } from "../sim/types";

export function lookReason(w: World): Msg | null {
  return w.player.quests.live !== null ? t("look.inScene") : null;
}
