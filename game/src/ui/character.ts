import { MAX_RANK, PERK_LEVELS, type PerkId, SKILL_IDS, XP_RULES } from '../data/skills';
import { maxHealthOf } from '../sim/health';
import { buyRank, canBuyRank, choosePerk, hasPerk, pendingPerkPairs, perkPair, type PerkPair, rankCost, xpTodayOf } from '../sim/progress';
import type { SkillId, World } from '../sim/types';
import { createIcon, type IconName } from './cards';
import { disabledWith, el, panel } from './dom';
import type { UiHost } from './host';
import { hp } from './units';
import { num, t, type Msg } from '../text/msg';
import { keyLabel } from './input-mode';
import { factionName, perkName, perkRule, refusalText, skillGrows, skillName } from '../text/names';
import { standingBands, standingParts, type StandingRow } from '../sim/relations';
import { modeRules } from '../sim/settings';

export class CharacterScreen {
  private root = panel('modal dialog');

  constructor(private host: UiHost) {
    this.root.classList.add('character-screen');
    this.root.style.display = 'none';
  }

  isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  toggle(): void {
    if (this.isOpen()) return this.close();
    this.root.style.display = '';
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
    this.root.replaceChildren(
      el('button', { class: 'close', onclick: () => this.close() }, keyLabel(t('character.close'), 'C')),
      el('h3', {}, t('character.title'), el('span', { class: 'chips' },
        el('span', { class: 'chip', title: t('character.health') }, createIcon('driver'), t('readout.ofMax', { n: hp(p.health), max: maxHealthOf(world) })),
        el('span', { class: 'chip', title: t('character.knockoutsTitle') }, createIcon('damage'), t('character.knockouts', { n: p.knockouts })),
        el('span', { class: 'chip xp-pool', title: t('character.xpPoolTitle') }, t('character.xpPool', { n: Math.floor(p.xp) })),
      )),
      el('div', { class: 'skill-table' },
        el('div', { class: 'skill-head' },
          el('span', { class: 'skill-name-col' }, t('character.colSkill')),
          el('span', {}, t('character.colRank')),
          ...PERK_LEVELS.map((level) => el('span', {}, t('character.colPerk', { rank: level }))),
          el('span', {}, t('character.colToday', { cap: XP_RULES.dailyCap })),
          el('span', {}),
        ),
        ...SKILL_IDS.map((id) => this.row(world, id)),
      ),
      ...(modeRules(world).standing ? [standingGroup(world)] : []),
    );
  }

  private row(world: World, id: SkillId): HTMLElement {
    const rank = world.player.ranks[id];
    const today = Math.floor(xpTodayOf(world, id));
    const open = pendingPerkPairs(world).filter((pair) => pair.skill === id);
    return el('div', { class: `skill-row${open.length > 0 ? ' pending' : ''}` },
      el('span', { class: 'skill-name', title: t('character.grows', { what: skillGrows(id) }) }, createIcon(SKILL_ICON[id]), skillName(id)),
      el('div', { class: 'skill-level', title: t('character.rankOf', { rank, max: MAX_RANK }) },
        ...Array.from({ length: MAX_RANK }, (_, i) => el('i', { class: i < rank ? 'on' : '' }))),
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
      ...disabledWith(blocked && refusalText(world, blocked), () => this.host.announce(buyRank(this.host.world(), skill))),
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
    const reason = state === 'active' ? null : refusalText(world, { id: 'notActive', state });
    const button = (id: PerkId) => el('button', {
      class: 'perk',
      ...disabledWith(reason, () => this.host.apply(choosePerk(this.host.world(), id))),
    }, el('b', {}, perkName(id)), el('span', {}, perkRule(id)));
    return el('div', { class: 'perk-cell perk-choice' }, rank, ...pair.perks.map(button));
  }
}

function standingGroup(world: World): HTMLElement {
  return el('div', { class: 'standing' },
    el('h4', { title: t('character.standingTitle') }, t('character.standing')),
    el('div', { class: 'standing-rows' }, ...standingBands(world).map((row) => standingRow(world, row))));
}

function standingRow(world: World, row: StandingRow): HTMLElement {
  const parts = standingParts(world, row);
  const tip = el('span', { class: 'tooltip standing-tip', role: 'tooltip' },
    tipRow(t('character.standingBase'), parts.base, 'base'),
    tipRow(t('character.standingDeeds'), parts.deeds, stepTone(parts.deeds)),
    tipRow(t('character.standingEarlier'), parts.earlier, stepTone(parts.earlier)));
  return el('div', { class: 'standing-row', tabindex: 0 },
    el('span', {}, factionName(row.faction)),
    el('span', { class: `tag ${row.band === 'hostile' ? 'bad' : 'dim'}` }, t(`band.${row.band}`)),
    tip);
}

function tipRow(label: Msg, value: number, tone: string): HTMLElement {
  return el('div', { class: `tooltip-row ${tone}`.trim() }, el('span', {}, label), el('span', { class: 'num' }, num(value, 'int')));
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
