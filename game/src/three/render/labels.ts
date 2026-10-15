
import { atlasOf, atlasSites } from '../../sim/atlas';
import { groundPoint, type VehicleFrame } from '../../phys/frames';
import type { World } from '../../sim/types';
import type { Vec } from '../../sim/vec';
import { el } from '../../ui/dom';
import { createBareItemIcon } from '../../ui/cards';
import type { JobMark, VehicleMark, WeaponMark } from '../../ui/weapons';
import { playerExplored, playerSees } from '../../sim/vision';
import { heldEscort } from '../../sim/escort-job';
import { vehicleName } from '../../ui/format';
import type { CameraRig } from './camera';
import type { SightLimit } from './scope';
import { setText } from '../../text/language';
import { num, t } from '../../text/msg';
import { fullName, siteName } from '../../text/names';
import { heldSearch } from '../../sim/market';
import { agoText } from '../../ui/units';

const LABEL_LIFT_PX = 90;
const LEAD_EXTRA_LIFT_PX = 26;


function labelEl(container: HTMLElement): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'world-label';
  container.appendChild(el);
  return el;
}

function place(el: HTMLDivElement, world: World, pos: Vec, rig: CameraRig, limit: SightLimit, explored: boolean, extraLift = 0): void {
  const ground = groundPoint(world.terrain, pos);
  const seen = explored && limit.covers(ground);
  el.style.display = seen ? 'block' : 'none';
  if (!seen) return;
  const screen = rig.screenOf(ground);
  el.style.left = `${screen.x}px`;
  el.style.top = `${screen.y - LABEL_LIFT_PX - extraLift}px`;
}

export class Labels {
  private els = new Map<string, HTMLDivElement>();
  private rumors = new Map<string, HTMLDivElement>();
  private lead: HTMLDivElement | null = null;
  private escort: HTMLDivElement | null = null;

  constructor(private readonly container: HTMLElement) {}

  update(world: World, rig: CameraRig, limit: SightLimit): void {
    const sites = atlasSites(atlasOf(world.terrain));
    for (const s of sites) {
      const el = this.siteLabel(s.id);
      setText(el, world.player.discovered.includes(s.id) ? siteName(s.id) : t('map.unknownSite'));
      place(el, world, s.pos, rig, limit, playerExplored(world, s.pos));
    }
    this.dropGoneSites(new Set(sites.map((s) => s.id)));
    this.updateRumors(world, rig, limit);
    this.updateEscort(world, rig, limit);
    this.updateLead(world, rig, limit);
  }

  private updateLead(world: World, rig: CameraRig, limit: SightLimit): void {
    const search = heldSearch(world);
    if (!search || search.delivered) {
      this.lead?.remove();
      this.lead = null;
      return;
    }
    this.lead ??= labelEl(this.container);
    setText(this.lead, t('map.lead', { driver: fullName(search.driver), ago: agoText(world.turn - search.lead.turn) }));
    place(this.lead, world, search.lead.at, rig, limit, true, LEAD_EXTRA_LIFT_PX);
  }

  private updateEscort(world: World, rig: CameraRig, limit: SightLimit): void {
    const job = heldEscort(world);
    const trader = job && world.vehicles.find((v) => v.id === job.client);
    const lastSeen = job && trader && !playerSees(world, trader.pos) ? job.seen : null;
    if (!job || !lastSeen) {
      this.escort?.remove();
      this.escort = null;
      return;
    }
    if (!this.escort) this.escort = labelEl(this.container);
    setText(this.escort, vehicleName(world, job.client));
    place(this.escort, world, lastSeen, rig, limit, true);
  }

  private dropGoneSites(ids: Set<string>): void {
    for (const [id, el] of this.els) {
      if (ids.has(id)) continue;
      el.remove();
      this.els.delete(id);
    }
  }

  private siteLabel(id: string): HTMLDivElement {
    const known = this.els.get(id);
    if (known) return known;
    const made = labelEl(this.container);
    this.els.set(id, made);
    return made;
  }

  private updateRumors(world: World, rig: CameraRig, limit: SightLimit): void {
    const stocks = world.salvage.filter((s) => world.player.rumored.includes(s.id));
    const ids = new Set(stocks.map((s) => s.id));
    for (const [id, el] of this.rumors) {
      if (ids.has(id)) continue;
      el.remove();
      this.rumors.delete(id);
    }
    for (const stock of stocks) {
      let el = this.rumors.get(stock.id);
      if (!el) {
        el = labelEl(this.container);
        setText(el, t('map.rumor'));
        this.rumors.set(stock.id, el);
      }
      place(el, world, stock.pos, rig, limit, true);
    }
  }
}

function weaponChip(mark: WeaponMark): HTMLElement {
  return el('div', { class: `marker-weapon ${mark.ready ? 'ready' : 'blocked'}`, title: mark.status },
    createBareItemIcon(mark.defId),
    el('span', { class: 'marker-slot' }, num(mark.slot, 'int')),
    el('span', { class: 'marker-status' }, mark.status),
  );
}

function jobChip(job: JobMark): HTMLElement {
  return el('div', { class: 'marker-job' },
    el('span', {}, job.label),
    el('span', { class: 'job-bar meter progress' }, el('span', { style: `width:${Math.round(job.progress * 100)}%` })),
  );
}

function weaponsRow(weapons: WeaponMark[]): HTMLElement | null {
  return weapons.length > 0 ? el('div', { class: 'marker-weapons' }, ...weapons.map(weaponChip)) : null;
}

function markerNode(mark: VehicleMark): HTMLElement {
  return el('div', { class: 'vehicle-marker' },
    weaponsRow(mark.weapons),
    mark.radio ? el('div', { class: 'marker-radio' }, t('map.radio')) : null,
    mark.out ? el('div', { class: 'marker-out' }, mark.gaveUp ? t('npc.gaveUp') : t('npc.knockedOut')) : null,
    mark.job ? jobChip(mark.job) : null,
  );
}

const MARKER_LIFT = 3.5;

export class VehicleMarkers {
  private readonly els = new Map<string, HTMLElement>();

  constructor(private readonly container: HTMLElement, private readonly rig: CameraRig) {}

  refresh(marks: Map<string, VehicleMark>): void {
    for (const node of this.els.values()) node.remove();
    this.els.clear();
    for (const [id, mark] of marks) {
      const node = markerNode(mark);
      this.container.appendChild(node);
      this.els.set(id, node);
    }
  }

  place(frames: Record<string, VehicleFrame>, hideAims: boolean, hideAll: boolean): void {
    for (const [id, node] of this.els) {
      const f = frames[id];
      node.style.display = hideAll || !f ? 'none' : 'flex';
      if (hideAll || !f) continue;
      node.classList.toggle('aims-hidden', hideAims);
      const p = this.rig.screenOf({ x: f.pos.x, y: f.pos.y + MARKER_LIFT, z: f.pos.z });
      node.style.left = `${p.x}px`;
      node.style.top = `${p.y}px`;
    }
  }
}
