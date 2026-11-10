import { ECONOMY } from '../data/goods';
import { BASICS, MAX_RANK, PERK_IDS, PERKS, type PerkId, SKILL_EFFECTS, SKILL_IDS, type SkillEffect } from '../data/skills';
import { REPAIR } from '../data/wear';
import { maxHealthOf } from '../sim/health';
import { buyRank, canBuyRank, choosePerk, hasPerk, pendingPerkPairs, rankCost } from '../sim/progress';
import type { SkillId, World } from '../sim/types';
import { createIcon, type IconName } from './cards';
import { disabledWith, el, panel } from './dom';
import type { UiHost } from './host';
import { standingNum, standingStep } from './format';
import { hp } from './units';
import { concat, MINUS_SIGN, num, PLUS, t, type Msg, type PlainKey } from '../text/msg';
import { keyLabel } from './input-mode';
import { basicName, basicRule, factionName, perkName, perkRule, refusalText, skillGrows, skillName, standingDeedName } from '../text/names';
import { standingBands, standingParts, type StandingRow } from '../sim/relations';
import { hasExplorationMap, modeRules } from '../sim/settings';
import { MapTab } from './map-tab';
import { lookReason } from './unstuck-reason';

export type CharacterTab = 'skills' | 'standing' | 'map';
type RankState = 'owned' | 'next' | 'locked';

export class CharacterScreen {
  readonly root = panel('modal dialog');
  private tab: CharacterTab = 'skills';
  private skill: SkillId | null = null;
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
    const world = this.host.world();
    const tab = this.offered(world).includes(requested) ? requested : 'skills';
    const opening = !this.isOpen() || this.tab !== tab;
    if (!this.isOpen()) this.skill = null;
    this.tab = tab;
    this.root.style.display = '';
    if (opening && tab === 'map') this.mapTab().open(world);
    this.render();
  }

  close(): void {
    this.root.style.display = 'none';
    this.root.replaceChildren();
  }

  render(): void {
    if (!this.isOpen()) return;
    const world = this.host.world();
    this.root.classList.toggle('map-open', this.tab === 'map');
    this.root.replaceChildren(this.top(world), ...this.page(world));
  }

  private offered(world: World): CharacterTab[] {
    return [
      'skills',
      ...(modeRules(world).standing ? ['standing' as const] : []),
      ...(hasExplorationMap(world) ? ['map' as const] : []),
    ];
  }

  private top(world: World): HTMLElement {
    const label: Record<CharacterTab, Msg> = { skills: t('character.tab.skills'), standing: t('character.standing'), map: t('map.full') };
    const button = (tab: CharacterTab) =>
      el('button', { class: this.tab === tab ? 'on' : '', 'data-tab': tab, onclick: () => this.open(tab) }, label[tab]);
    const map = this.tab === 'map';
    return el('div', { class: 'char-top' },
      el('h3', {}, t('character.title')),
      el('div', { class: 'tabs sub' }, ...this.offered(world).map(button), ...(map ? [this.mapTab().controls] : [])),
      el('button', { class: 'close', onclick: () => this.close() }, keyLabel(t(map ? 'map.close' : 'character.close'), map ? 'M' : 'C')));
  }

  private page(world: World): HTMLElement[] {
    if (this.tab === 'map') return this.mapBody(world);
    if (this.tab === 'standing') return [standingPage(world)];
    const skill = this.shownSkill(world);
    return [this.skillTabs(world, skill), this.skillPage(world, skill)];
  }

  private shownSkill(world: World): SkillId {
    this.skill ??= pendingPerkPairs(world)[0]?.skill ?? SKILL_IDS[0];
    return this.skill;
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

  private skillTabs(world: World, shown: SkillId): HTMLElement {
    return el('div', { class: 'char-tabs' }, ...SKILL_IDS.map((id) => this.skillTab(world, id, id === shown)), pool(world));
  }

  private skillTab(world: World, skill: SkillId, on: boolean): HTMLElement {
    const rank = world.player.ranks[skill];
    const picking = pendingPerkPairs(world).some((pair) => pair.skill === skill);
    const cost = rank < MAX_RANK ? rankCost(rank + 1) : null;
    return el('button', { class: `skill-tab${on ? ' on' : ''}`, 'data-skill': skill, title: t('character.grows', { what: skillGrows(skill) }), onclick: () => { this.skill = skill; this.render(); } },
      el('span', { class: 'skill-tab-line' },
        el('span', { class: 'skill-tab-name' }, plainIcon(SKILL_ICON[skill]), skillName(skill), picking ? el('span', { class: 'pick-tag' }, t('character.pickOpen')) : null)),
      el('span', { class: 'skill-tab-line' }, pips(rank),
        cost === null ? null : el('span', { class: `skill-tab-cost num${world.player.xp >= cost ? '' : ' short'}` }, t('character.xpPool', { n: cost }))));
  }

  private skillPage(world: World, skill: SkillId): HTMLElement {
    const rank = world.player.ranks[skill];
    const effects = skillEffectRows(skill, rank);
    return el('div', { class: 'char-page skill-page', style: `--effects:${effects.length}` },
      el('div', { class: 'effect-strip' }, el('span', {}),
        el('div', { class: 'effect-grid' }, ...effects.map((e) => el('div', { class: 'effect-cell' },
          el('span', { class: 'effect-label' }, e.label),
          el('span', { class: `effect-total num${e.none ? ' zero' : ''}` }, e.total))))),
      el('div', { class: 'rank-ladder' }, ...Array.from({ length: MAX_RANK }, (_, i) => this.rankRow(world, skill, i + 1))));
  }

  private rankRow(world: World, skill: SkillId, level: number): HTMLElement {
    const rank = world.player.ranks[skill];
    const state: RankState = level <= rank ? 'owned' : level === rank + 1 ? 'next' : 'locked';
    const cards = level === 1 ? [basicCard(skill, state === 'owned')] : perksAt(skill, level).map((id) => this.perkCard(world, id, level <= rank));
    return el('div', { class: `rank-row ${state}`, 'data-rank': level },
      this.rankCell(world, skill, level, state),
      el('div', { class: 'rank-body' },
        state === 'next' ? el('div', { class: 'rank-gains effect-grid' }, ...skillEffectRows(skill, rank).map((e) => el('span', { class: 'num' }, e.gain))) : null,
        cards.length > 0 ? el('div', { class: 'rank-cards' }, ...cards) : null));
  }

  private rankCell(world: World, skill: SkillId, level: number, state: RankState): HTMLElement {
    const cost = rankCost(level);
    const short = state === 'next' && world.player.xp < cost;
    return el('div', { class: 'rank-cell' },
      el('i', { class: 'rank-node' }),
      el('b', {}, num(level, 'int')),
      state === 'next' ? this.buyButton(world, skill) : null,
      state === 'owned' ? null : el('span', { class: `rank-cost num${short ? ' short' : ''}` }, t('character.xpPool', { n: cost })));
  }

  private buyButton(world: World, skill: SkillId): HTMLElement {
    const blocked = canBuyRank(world, skill);
    return el('button', {
      class: 'btn-s buy-rank',
      ...disabledWith(lookReason(world) ?? (blocked ? refusalText(world, blocked) : null), () => this.host.announce(buyRank(this.host.world(), skill))),
    }, t('character.buyRank'));
  }

  private perkCard(world: World, id: PerkId, reached: boolean): HTMLElement {
    const level = PERKS[id].level;
    const picked = perksAt(PERKS[id].skill, level).find((other) => hasPerk(world, other));
    const kind = picked === id ? 'taken' : picked ? 'passed' : reached ? 'open' : '';
    return el('div', { class: `perk-card ${kind}`.trim(), 'data-perk': id },
      el('div', { class: 'perk-text' }, el('b', {}, perkName(id)), el('span', {}, perkRule(id))),
      kind === 'open' ? this.pickButton(world, id) : null);
  }

  private pickButton(world: World, id: PerkId): HTMLElement {
    const state = world.player.state;
    const reason = lookReason(world) ?? (state === 'active' ? null : refusalText(world, { id: 'notActive', state }));
    return el('button', { class: 'btn-s pick-perk', ...disabledWith(reason, () => this.host.apply(choosePerk(this.host.world(), id))) }, t('character.pickPerk'));
  }
}

function perksAt(skill: SkillId, level: number): PerkId[] {
  return PERK_IDS.filter((id) => PERKS[id].skill === skill && PERKS[id].level === level);
}

function basicCard(skill: SkillId, owned: boolean): HTMLElement {
  const basic = BASICS[skill];
  return el('div', { class: `perk-card${owned ? ' taken' : ''}` },
    el('div', { class: 'perk-text' }, el('b', {}, basicName(basic)), el('span', {}, basicRule(basic))));
}

function pool(world: World): HTMLElement {
  const p = world.player;
  return el('div', { class: 'char-pool' },
    el('div', { class: 'char-pool-row xp' }, el('span', {}, t('character.xpLabel')), el('span', { class: 'num' }, num(Math.floor(p.xp), 'int'))),
    el('div', { class: 'char-pool-row' }, el('span', {}, t('character.health')), el('span', { class: 'num' }, t('readout.ofMax', { n: hp(p.health), max: maxHealthOf(world) }))));
}

function pips(rank: number): HTMLElement {
  return el('span', { class: 'rank-pips' }, ...Array.from({ length: MAX_RANK }, (_, i) => el('i', { class: i < rank ? 'on' : '' })));
}

function plainIcon(name: IconName): HTMLElement {
  const icon = createIcon(name);
  icon.removeAttribute('title');
  return icon;
}

function standingPage(world: World): HTMLElement {
  return el('div', { class: 'char-page standing-page' }, ...standingBands(world).map((row) => standingRow(world, row)));
}

function standingRow(world: World, row: StandingRow): HTMLElement {
  const parts = standingParts(world, row);
  const explained = parts.deeds.length > 0 || parts.earlier !== 0;
  const tip = el('span', { class: 'tooltip standing-tip', role: 'tooltip' },
    tipRow(t('character.standingBase'), standingNum(parts.base), 'base'),
    ...parts.deeds.map((d) => tipRow(standingDeedName(d.deed), standingStep(d.delta), stepTone(d.delta))),
    ...(parts.earlier === 0 ? [] : [tipRow(t('character.standingEarlier'), standingStep(parts.earlier), stepTone(parts.earlier))]));
  return el('div', { class: 'standing-row', 'data-faction': row.faction },
    el('span', {}, factionName(row.faction)),
    explained
      ? el('span', { class: 'num standing-score explained', tabindex: 0 }, standingNum(row.score), tip)
      : el('span', { class: 'num standing-score' }, standingNum(row.score)),
    el('span', { class: `standing-band${row.band === 'hostile' ? ' bad' : ''}` }, t(`band.${row.band}`)));
}

function tipRow(label: Msg, value: Msg, tone: string): HTMLElement {
  return el('div', { class: `tooltip-row ${tone}`.trim() }, el('span', {}, label), el('span', { class: 'num' }, value));
}

function stepTone(step: number): string {
  if (step === 0) return '';
  return step > 0 ? 'up' : 'down';
}

type EffectShown = { label: PlainKey; grows: 1 | -1; base?: number; scale?: number };

const EFFECT_SHOWN: { [S in SkillId]: Record<SkillEffect<S>, EffectShown> } = {
  driving: {
    turnRate: { label: 'effect.turnRate', grows: 1 },
    crashDamage: { label: 'effect.crashDamage', grows: -1 },
    roughSpeed: { label: 'effect.roughSpeed', grows: -1 },
    crawl: { label: 'effect.crawl', grows: 1 },
  },
  perception: {
    spread: { label: 'effect.spread', grows: -1 },
    sight: { label: 'effect.sight', grows: 1 },
    hearing: { label: 'effect.hearing', grows: 1 },
    contactFix: { label: 'effect.contactFix', grows: -1 },
  },
  machining: {
    repair: { label: 'effect.repair', grows: -1 },
    fieldCap: { label: 'effect.fieldCap', grows: 1, base: REPAIR.fieldCapShare },
    refit: { label: 'effect.refit', grows: -1 },
    search: { label: 'effect.search', grows: -1 },
    engineHeat: { label: 'effect.engineHeat', grows: -1 },
  },
  toughness: {
    supplies: { label: 'effect.supplies', grows: -1 },
    maxHealth: { label: 'effect.maxHealth', grows: 1 },
    cabShare: { label: 'effect.cabShare', grows: -1 },
    heatDrain: { label: 'effect.heatDrain', grows: -1 },
  },
  social: {
    priceSpread: { label: 'effect.priceSpread', grows: -1, base: ECONOMY.spread * 2, scale: 2 },
    towFee: { label: 'effect.towFee', grows: -1 },
    patchPrice: { label: 'effect.patchPrice', grows: -1 },
    robberyDanger: { label: 'effect.robberyDanger', grows: 1 },
  },
};

type ShownEffect = { label: Msg; total: Msg; gain: Msg; none: boolean };

function skillEffectRows(skill: SkillId, rank: number): ShownEffect[] {
  const effects: Record<string, number> = SKILL_EFFECTS[skill];
  const shown: Record<string, EffectShown> = EFFECT_SHOWN[skill];
  return Object.entries(effects).map(([key, perRank]) => {
    const how = shown[key];
    const step = Math.round(perRank * (how.scale ?? 1) * 100);
    return {
      label: t(how.label),
      total: how.base === undefined ? signedShare(how.grows, step * rank) : t('character.percent', { n: Math.min(100, Math.max(0, Math.round(how.base * 100) + how.grows * step * rank)) }),
      gain: concat([growthSign(how.grows), t(how.base === undefined ? 'character.percent' : 'character.points', { n: step })]),
      none: how.base === undefined && rank === 0,
    };
  });
}

function signedShare(grows: 1 | -1, n: number): Msg {
  if (n === 0) return t('character.percent', { n: 0 });
  return concat([growthSign(grows), t('character.percent', { n })]);
}

function growthSign(grows: 1 | -1): Msg {
  return grows > 0 ? PLUS : MINUS_SIGN;
}

const SKILL_ICON: Record<SkillId, IconName> = {
  driving: 'wheel',
  perception: 'scanner',
  machining: 'tools',
  toughness: 'armor',
  social: 'trade',
};
