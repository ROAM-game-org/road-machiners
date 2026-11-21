import { Msg, type Param } from './msg';

export type MsgData = { key: string; params?: Record<string, ParamData>; items?: MsgData[] };
type ParamData = number | string | MsgData;

export function msgData(msg: Msg): MsgData {
  const data: MsgData = { key: msg.key };
  const params = Object.entries(msg.params);
  if (params.length > 0) data.params = Object.fromEntries(params.map(([name, value]) => [name, paramData(value)]));
  if (msg.items.length > 0) data.items = msg.items.map(msgData);
  return data;
}

function paramData(value: Param): ParamData {
  return Msg.is(value) ? msgData(value) : value;
}

export function msgOfData(data: unknown): Msg | null {
  if (!isRecord(data) || typeof data.key !== 'string') return null;
  const params = paramsOfData(data.params);
  const items = itemsOfData(data.items);
  return params && items ? new Msg(data.key, params, items) : null;
}

function paramsOfData(data: unknown): Record<string, Param> | null {
  if (data === undefined) return {};
  if (!isRecord(data)) return null;
  const params = Object.entries(data).map(([name, value]) => [name, paramOfData(value)] as const);
  return params.every(([, param]) => param !== null) ? (Object.fromEntries(params) as Record<string, Param>) : null;
}

function paramOfData(value: unknown): Param | null {
  return typeof value === 'number' || typeof value === 'string' ? value : msgOfData(value);
}

function itemsOfData(data: unknown): Msg[] | null {
  if (data === undefined) return [];
  if (!Array.isArray(data)) return null;
  const items = data.map(msgOfData);
  return items.every((item) => item !== null) ? (items as Msg[]) : null;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
