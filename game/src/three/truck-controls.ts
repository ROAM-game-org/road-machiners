
import { deskAt } from '../sim/crime';
import type { Msg } from '../text/msg';
import { refusalText } from '../text/names';
import { readyAid, startAid } from "../sim/aid";
import { handOverParcel, readyHandover } from "../sim/parcel";
import { playerVehicle } from "../sim/damage";
import { canDouse, douseEngine } from "../sim/engine-heat";
import { isBusy, startFirstAid } from "../sim/jobs";
import { inOverdrive, overdriveBlock } from "../sim/stats";
import { canLoot, canScavenge, scavenge } from "../sim/locations";
import { startSurvey } from "../sim/survey";
import { shopAt } from "../sim/market";
import { reachedOutpostAt } from "../sim/chaos-highway";
import type { World } from "../sim/types";
import { playerCanAct, Refused, setAutoRepair, setDirect, setHeadlights, setOverdrive } from "../sim/world";
import { markError, markVehicle } from "../sim/detect";
import { lookOver } from "../sim/look-over";
import { hasBasic } from "../sim/progress";
import { type CardAction, type ContextAction, type ContextTarget } from "../ui/hud";
import { ContextPicker, getContextActions } from "../ui/hud-readout";

export type ControlsHost = {
  world: () => World;
  apply: (next: World) => void;
  commit: (next: World) => void;
  refreshPlan: () => void;
  doused: () => void;
  note: (text: Msg) => void;
  revved: () => void;
};

export class TruckControls {
  constructor(private host: ControlsHost) {}

  toggleManual(): void {
    const w = this.host.world();
    if (!playerCanAct(w)) return;
    this.host.apply(setDirect(w, !playerVehicle(w).direct));
    this.host.refreshPlan();
  }

  toggleAutoRepair(): void {
    const w = this.host.world();
    this.host.apply(setAutoRepair(w, !w.player.autoRepair));
  }

  toggleOverdrive(): void {
    const w = this.host.world();
    if (!playerCanAct(w)) return;
    const me = playerVehicle(w);
    const on = !inOverdrive(w, me);
    if (on && overdriveBlock(w, me) !== null) return;
    this.host.apply(setOverdrive(w, on));
    this.host.refreshPlan();
    if (on) this.host.revved();
  }

  toggleHeadlights(): void {
    const w = this.host.world();
    this.host.commit(setHeadlights(w, !w.player.headlights));
  }

  douseEngine(): void {
    const w = this.host.world();
    if (!playerCanAct(w) || !canDouse(w)) return;
    this.host.apply(douseEngine(w));
    this.host.doused();
  }

  firstAid(): void {
    const w = this.host.world();
    if (!playerCanAct(w) || !hasBasic(w, 'firstAid')) return;
    try {
      this.host.apply(startFirstAid(w));
    } catch (err) {
      if (!(err instanceof Refused)) throw err;
      this.host.note(refusalText(w, err.refusal));
    }
  }
}

export type ContextHost = {
  world: () => World;
  playing: () => boolean;
  apply: (next: World) => void;
  pushEvents: () => void;
  note: (text: Msg) => void;
  openTrade: (npcId: string) => void;
  openTown: () => void;
  openOutpost: () => void;
  openDowned: (vehicleId: string) => void;
  openLoot: (stockId: string) => void;
};

export class TruckContext {
  private readonly picker = new ContextPicker();

  constructor(private host: ContextHost) {}

  shown(): { action: ContextAction | null; count: number; index: number } {
    const actions = getContextActions(this.host.world(), this.host.playing());
    const action = this.picker.pick(actions);
    return { action, count: actions.length, index: Math.max(0, actions.findIndex((a) => a === action)) };
  }

  cycle(step: 1 | -1): void {
    this.picker.cycle(getContextActions(this.host.world(), this.host.playing()), step);
  }

  onCard(action: CardAction, id: string | null): void {
    const w = this.host.world();
    if (!id) return;
    if (action === 'mark' && !markError(w, id)) this.host.apply(markVehicle(w, id));
    if (action === 'lookOver' && hasBasic(w, 'lookOver')) this.refusable(() => lookOver(w, id));
  }

  private refusable(next: () => World): void {
    try {
      this.host.apply(next());
    } catch (err) {
      if (!(err instanceof Refused)) throw err;
      this.host.note(refusalText(this.host.world(), err.refusal));
    }
  }

  use(): void {
    const w = this.host.world();
    if (this.host.playing() || !playerCanAct(w)) return;
    const action = this.picker.pick(getContextActions(w, false));
    if (action) this.run(action);
  }

  private run(action: ContextAction): void {
    const target: ContextTarget = action.target;
    const h = this.host;
    const handlers: { [K in ContextTarget['kind']]: () => void } = {
      aid: () => 'id' in target && this.startAid(target.id),
      trade: () => 'id' in target && h.openTrade(target.id),
      parcel: () => 'id' in target && this.handParcel(target.id),
      shop: () => (shopAt(h.world()) || deskAt(h.world())) && h.openTown(),
      outpost: () => reachedOutpostAt(h.world()) && h.openOutpost(),
      downed: () => 'id' in target && h.openDowned(target.id),
      stock: () => 'id' in target && this.searchStock(target.id, action.combat),
      survey: () => target.kind === 'survey' && this.surveySite(target.contractId, target.id, action.combat),
      loot: () => 'id' in target && this.lootStock(target.id),
      empty: () => undefined,
    };
    handlers[target.kind]();
  }

  private startAid(npcId: string): void {
    const aid = readyAid(this.host.world());
    if (aid?.holder !== npcId) return;
    this.host.apply(startAid(this.host.world(), npcId));
    this.host.pushEvents();
  }

  private handParcel(npcId: string): void {
    if (readyHandover(this.host.world())?.holder !== npcId) return;
    this.host.apply(handOverParcel(this.host.world(), npcId));
    this.host.pushEvents();
  }

  searchStock(stockId: string, combat?: number): void {
    const w = this.host.world();
    const me = playerVehicle(w);
    if (isBusy(me) && me.job) return this.host.note(refusalText(w, { id: 'busy', job: me.job.kind }));
    if (combat !== undefined) return this.host.note(refusalText(w, { id: 'inCombat' }));
    if (canScavenge(w, stockId)) {
      this.host.apply(scavenge(w, stockId));
      this.host.pushEvents();
    }
  }

  private surveySite(contractId: string, site: string, combat?: number): void {
    const w = this.host.world();
    if (isBusy(playerVehicle(w)) || combat !== undefined) return;
    this.host.apply(startSurvey(w, contractId, site));
    this.host.pushEvents();
  }

  private lootStock(stockId: string): void {
    const w = this.host.world();
    if (!isBusy(playerVehicle(w)) && canLoot(w, stockId)) this.host.openLoot(stockId);
  }
}
