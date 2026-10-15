import { isIPv4, isIPv6 } from 'node:net';
import { Rejected } from './report';

const GROUPS = 8;
const PREFIX_GROUPS = 4;
const MAPPED_MARK = 0xffff;

export function limitKeyOf(address: string): string {
  if (isIPv4(address)) return address;
  if (!isIPv6(address)) throw new Rejected('address', 400, 'The client address is not an IP address.');
  const groups = expandIPv6(address.split('%')[0]);
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === MAPPED_MARK) return mappedIPv4(groups);
  return `${groups.slice(0, PREFIX_GROUPS).map((group) => group.toString(16)).join(':')}::/64`;
}

function mappedIPv4(groups: number[]): string {
  return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join('.');
}

function expandIPv6(address: string): number[] {
  const [head, tail = null] = address.split('::');
  const front = hexGroups(head);
  if (tail === null) return front;
  const back = hexGroups(tail);
  return [...front, ...new Array<number>(GROUPS - front.length - back.length).fill(0), ...back];
}

function hexGroups(text: string): number[] {
  if (text === '') return [];
  return text.split(':').flatMap((part) => (isIPv4(part) ? dottedGroups(part) : [parseInt(part, 16)]));
}

function dottedGroups(dotted: string): number[] {
  const [a, b, c, d] = dotted.split('.').map(Number);
  return [(a << 8) | b, (c << 8) | d];
}
