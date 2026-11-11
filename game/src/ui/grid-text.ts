import { MAP_GRID } from '../data/region';
import type { GridSquare } from '../sim/map-grid';
import { num, t, type Msg } from '../text/msg';

const GRID_COLUMNS = ['map.column.a', 'map.column.b', 'map.column.c', 'map.column.d', 'map.column.e', 'map.column.f', 'map.column.g', 'map.column.h'] as const;

export function gridColumnLetter(column: number): Msg {
  const key = GRID_COLUMNS[column];
  if (key === undefined) throw new Error(`Map grid column ${column} has no letter`);
  return t(key);
}

export function gridRowNumber(row: number): Msg {
  if (!Number.isInteger(row) || row < 0 || row >= MAP_GRID.squares) throw new Error(`Map grid row ${row} has no number`);
  return num(row + 1, 'int');
}

export function gridSquareText(square: GridSquare): Msg {
  return t('map.square', { column: gridColumnLetter(square.column), row: gridRowNumber(square.row) });
}
