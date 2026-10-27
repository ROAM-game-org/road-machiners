import { BASIC_RANK, BASICS, MAX_RANK, PERK_LEVELS, type PerkId, SKILL_IDS, XP_RULES } from '../data/skills';
import { maxHealthOf } from '../sim/health';
import { buyRank, canBuyRank, choosePerk, hasBasic, hasPerk, pendingPerkPairs, perkPair, type PerkPair, rankCost, xpTodayOf } from '../sim/progress';
import type { SkillId, World } from '../sim/types';
import { createIcon, type IconName } from './cards';
import { disabledWith, el, panel } from './dom';
import type { UiHost } from './host';
import { standingNum, standingStep } from './format';
import { hp } from './units';
import { num, t, type Msg } from '../text/msg';
import { keyLabel } from './input-mode';
import { basicName, basicRule, factionName, perkName, perkRule, refusalText, skillGrows, skillName, standingDeedName } from '../text/names';
import { standingBands, standingParts, type StandingRow } from '../sim/relations';
import { hasExplorationMap, modeRules } from '../sim/settings';
import { MapTab } from './map-tab';
import { lookReason } from './unstuck-reason';

export type CharacterTab = 'skills' | 'map';

export class CharacterScreen {
  readonly root = panel('modal dialog');
  private tab: CharacterTab = 'skills';
  private map: MapTab | null = null;

  constructor(private host: UiHost) {
    this.root.classList.add('character-screen');
    this.root.style.display = 'none';
  }

  isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  toggle(tab: CharacterTab = 'skills'): void {
    if (this.isOpen() && this.tab === tab) return this.close();
    this.open(tab);
  }

  open(requested: CharacterTab): void {
    const tab = requested === 'map' && !hasExplorationMap(this.host.world()) ? 'skills' : requested;
    const opening = !this.isOpen() || this.tab !== tab;
    this.tab = tab;
    this.root.style.display = '';
    if (opening && tab === 'map') this.mapTab().open(this.host.world());
    this.render();
  }

  close(): void {
    this.root.style.display = 'none';
    this.root.replaceChildren();
  }

  render(): void {
    if (!this.isOpen()) return;
    const world = this.host.world();
    const p = world.player;
    this.root.classList.toggle('map-open', this.tab === 'map');
    this.root.replaceChildren(
      el('button', { class: 'close', onclick: () => this.close() }, keyLabel(t(this.tab === 'map' ? 'map.close' : 'character.close'), this.tab === 'map' ? 'M' : 'C')),
      el('h3', {}, t('character.title'), el('span', { class: 'chips' },
        el('span', { class: 'chip', title: t('character.health') }, createIcon('driver'), t('readout.ofMax', { n: hp(p.health), max: maxHealthOf(world) })),
        el('span', { class: 'chip', title: t('character.knockoutsTitle') }, createIcon('damage'), t('character.knockouts', { n: p.knockouts })),
        el('span', { class: 'chip xp-pool', title: t('character.xpPoolTitle') }, t('character.xpPool', { n: Math.floor(p.xp) })),
      ), this.tabs(world)),
      ...(this.tab === 'map' ? this.mapBody(world) : this.skills(world)),
    );
  }

  private tabs(world: World): HTMLElement {
    const button = (tab: CharacterTab, label: Msg) =>
      el('button', { class: this.tab === tab ? 'on' : '', 'data-tab': tab, onclick: () => this.open(tab) }, label);
    return el('div', { class: 'tabs' },
      button('skills', t('character.tab.skills')),
      ...(hasExplorationMap(world) ? [button('map', t('map.full'))] : []),
      ...(this.tab === 'map' ? [this.mapTab().controls] : []));
  }

  private mapTab(): MapTab {
    this.map ??= new MapTab(this.host);
    return this.map;
  }

  private mapBody(world: World): HTMLElement[] {
    const map = this.mapTab();
    map.render(world);
    return [map.body];
  }

  private skills(world: World): HTMLElement[] {
    return [
      el('div', { class: 'skill-table' },
        el('div', { class: 'skill-head' },
          el('span', { class: 'skill-name-col' }, t('character.colSkill')),
          el('span', {}, t('character.colRank')),
          el('span', {}, t('character.colBasic', { rank: BASIC_RANK })),
          ...PERK_LEVELS.map((level) => el('span', {}, t('character.colPerk', { rank: level }))),
          el('span', {}, t('character.colToday', { cap: XP_RULES.dailyCap })),
          el('span', {}),
        ),
        ...SKILL_IDS.map((id) => this.row(world, id)),
      ),
      ...(modeRules(world).standing ? [standingGroup(world)] : []),
    ];
  }

  private row(world: World, id: SkillId): HTMLElement {
    const rank = world.player.ranks[id];
    const today = Math.floor(xpTodayOf(world, id));
    const open = pendingPerkPairs(world).filter((pair) => pair.skill === id);
    return el('div', { class: `skill-row${open.length > 0 ? ' pending' : ''}` },
      el('span', { class: 'skill-name', title: t('character.grows', { what: skillGrows(id) }) }, createIcon(SKILL_ICON[id]), skillName(id)),
      el('div', { class: 'skill-level', title: t('character.rankOf', { rank, max: MAX_RANK }) },
        ...Array.from({ length: MAX_RANK }, (_, i) => el('i', { class: i < rank ? 'on' : '' }))),
      basicCell(world, id),
      ...PERK_LEVELS.map((level) => this.perkCell(world, perkPair(id, level), open.some((o) => o.level === level), level)),
      el('div', { class: 'skill-today' },
        el('div', { class: 'meter progress' }, el('div', { style: `width:${Math.min(today / XP_RULES.dailyCap, 1) * 100}%` })),
        el('span', { class: `num${today === 0 ? ' dim' : ''}` }, num(today, 'int'))),
      this.buy(world, id, rank),
    );
  }

  private buy(world: World, skill: SkillId, rank: number): HTMLElement {
    if (rank >= MAX_RANK) return el('span', { class: 'skill-buy dim' }, t('character.maxRank'));
    const blocked = canBuyRank(world, skill);
    const next = { rank: rank + 1, cost: rankCost(rank + 1) };
    return el('button', {
      class: 'btn-s skill-buy buy-rank',
      ...disabledWith(lookReason(world) ?? (blocked ? refusalText(world, blocked) : null), () => this.host.announce(buyRank(this.host.world(), skill))),
    }, t('character.buyShort', { cost: next.cost }));
  }

  private perkCell(world: World, pair: PerkPair, isOpen: boolean, level: number): HTMLElement {
    const rank = el('span', { class: 'perk-rank dim' }, t('character.colPerk', { rank: level }));
    const picked = pair.perks.find((id) => hasPerk(world, id));
    if (picked) return el('div', { class: 'perk-cell picked', title: perkRule(picked) }, rank, perkName(picked));
    if (isOpen) return this.choice(world, pair, rank);
    return el('div', { class: 'perk-cell locked' }, rank,
      ...pair.perks.map((id) => el('span', { title: perkRule(id) }, perkName(id))));
  }

  private choice(world: World, pair: PerkPair, rank: HTMLElement): HTMLElement {
    const state = world.player.state;
    const reason = lookReason(world) ?? (state === 'active' ? null : refusalText(world, { id: 'notActive', state }));
    const button = (id: PerkId) => el('button', {
      class: 'perk',
      ...disabledWith(reason, () => this.host.apply(choosePerk(this.host.world(), id))),
    }, el('b', {}, perkName(id)), el('span', {}, perkRule(id)));
    return el('div', { class: 'perk-cell perk-choice' }, rank, ...pair.perks.map(button));
  }
}

function basicCell(world: World, skill: SkillId): HTMLElement {
  const basic = BASICS[skill];
  return el('div', { class: `perk-cell basic-cell ${hasBasic(world, basic) ? 'picked' : 'locked'}`, title: basicRule(basic) }, basicName(basic));
}

function standingGroup(world: World): HTMLElement {
  return el('div', { class: 'standing' },
    el('div', { class: 'standing-head' }, el('span', {}, t('character.standing'))),
    ...standingBands(world).map((row) => standingRow(world, row)));
}

function standingRow(world: World, row: StandingRow): HTMLElement {
  const parts = standingParts(world, row);
  const tip = el('span', { class: 'tooltip standing-tip', role: 'tooltip' },
    tipRow(t('character.standingBase'), standingNum(parts.base), 'base'),
    ...parts.deeds.map((d) => tipRow(standingDeedName(d.deed), standingStep(d.delta), stepTone(d.delta))),
    tipRow(t('character.standingEarlier'), standingStep(parts.earlier), stepTone(parts.earlier)));
  return el('div', { class: 'standing-row row' },
    el('span', {}, factionName(row.faction)),
    el('span', { class: `num standing-score${row.score === 0 ? ' dim' : ''}`, tabindex: 0 }, standingNum(row.score), tip),
    el('span', { class: `tag ${row.band === 'hostile' ? 'bad' : 'dim'}` }, t(`band.${row.band}`)));
}

function tipRow(label: Msg, value: Msg, tone: string): HTMLElement {
  return el('div', { class: `tooltip-row ${tone}`.trim() }, el('span', {}, label), el('span', { class: 'num' }, value));
}

function stepTone(step: number): string {
  if (step === 0) return '';
  return step > 0 ? 'up' : 'down';
}

const SKILL_ICON: Record<SkillId, IconName> = {
  driving: 'wheel',
  perception: 'scanner',
  machining: 'tools',
  toughness: 'armor',
  social: 'trade',
};
