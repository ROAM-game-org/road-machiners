import { PHYSICS } from '../data/physics';
import { RULES } from '../data/rules';
import { TIME } from '../data/time';
import { UNITS } from '../data/units';
import { compassOctant } from '../text/compass';
import { concat, MINUS_SIGN, num, SPACE, t, type Msg } from '../text/msg';
import type { Vec } from '../sim/vec';
import { el } from './dom';

const MS_TO_KPH = 3.6;
const HOURS_PER_DAY = 24;

export function kph(tilesPerTurn: number): number {
  return Math.round((tilesPerTurn * PHYSICS.metersPerTile) / PHYSICS.turnSeconds * MS_TO_KPH);
}

export function mps2(tilesPerTurn2: number): number {
  return Math.round((tilesPerTurn2 * PHYSICS.metersPerTile) / PHYSICS.turnSeconds ** 2 * 10) / 10;
}

export function agoText(turns: number): Msg {
  const hours = Math.floor(turns / (TIME.turnsPerDay / HOURS_PER_DAY));
  return hours < 1 ? t('ago.underHour') : t('ago.hours', { n: hours });
}

export function meters(tiles: number): number {
  return Math.round(tiles * PHYSICS.metersPerTile);
}

const METERS_PER_KM = 1000;

export function distanceText(tiles: number): Msg {
  const m = meters(tiles);
  return m >= METERS_PER_KM ? t('units.km', { n: m / METERS_PER_KM }) : t('units.m', { n: m });
}

export function compassText(rad: number): Msg {
  return t(`compass.${compassOctant(rad)}`);
}

export function bearingText(from: Vec, to: Vec): Msg {
  return compassText(Math.atan2(to.y - from.y, to.x - from.x));
}

export function liters(cells: number): number {
  return Math.round(cells * RULES.cellMeters * RULES.cellMeters * UNITS.cellDepth * 1000);
}

export function fuelLiters(units: number): number {
  return Math.round(units * UNITS.fuelLiters);
}

export function celsius(heat: number): number {
  return Math.round(UNITS.shadeCelsius + (heat - 1) * UNITS.celsiusPerHeat);
}

export function kg(mass: number): Msg {
  return t('units.kg', { n: Math.round(mass) });
}

export function engineCelsius(engineHeat: number): number {
  return Math.round(UNITS.engineColdCelsius + engineHeat * (UNITS.engineHotCelsius - UNITS.engineColdCelsius));
}

export function hp(value: number): number {
  return Math.ceil(value);
}

export function damage(value: number): number {
  return Math.ceil(value);
}

const WHOLE_M = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const MINUS = '\u2212';

export function moneyM(amount: number): number {
  if (amount === 0) return 0;
  return Math.sign(amount) * Math.ceil(Math.abs(amount) - 1e-9);
}

export function moneyAmount(amount: number): string {
  const m = moneyM(amount);
  if (m === 0) return '0';
  const text = WHOLE_M.format(Math.abs(m));
  return m < 0 ? `${MINUS}${text}` : text;
}

export function moneyText(amount: number): string {
  const shown = moneyAmount(amount);
  return `${shown} ${shown === '1' || shown === `${MINUS}1` ? UNITS.currency.one : UNITS.currency.many}`;
}

export function moneyNumber(amount: number): string {
  if (!Number.isFinite(amount)) throw new Error(`Not a currency amount: ${amount}`);
  return moneyAmount(amount);
}

const COIN_SVG =
  '<svg viewBox="0 0 40 40" focusable="false"><circle cx="20" cy="20" r="17" stroke-width="3"/><path d="M15.2 24.8V15.2l4.8 6 4.8-6v9.6" fill="none" stroke-width="2.16" stroke-linejoin="round" stroke-linecap="round"/></svg>';

export function coinEl(): HTMLElement {
  const coin = el('span', { class: 'coin', 'aria-hidden': 'true' });
  coin.innerHTML = COIN_SVG;
  return coin;
}

export function moneyEl(amount: number): HTMLElement {
  const text = moneyMsg(amount);
  return el('span', { class: `amount${amount < 0 ? ' bad' : ''}`, title: text, 'aria-label': text }, coinEl(), moneyNum(amount));
}

export function pricedEl(action: Msg, amount: number): HTMLElement {
  return el('span', { class: 'priced' }, action, SPACE, moneyEl(amount));
}

export function moneyDelta(amount: number): string {
  const text = moneyText(amount);
  return amount > 0 ? `+${text}` : text;
}

export function turnsText(turns: number): string {
  return `${turns} ${turns === 1 ? 'turn' : 'turns'}`;
}

export function moneyNum(amount: number): Msg {
  const m = moneyM(amount);
  return m < 0 ? concat([MINUS_SIGN, num(-m, 'int')]) : num(m, 'int');
}

export function moneyMsg(amount: number): Msg {
  const m = moneyM(amount);
  return m < 0 ? t('money.minus', { n: -m }) : t('money.m', { n: m });
}
