export type PackSlice = { pack: string; offset: number; length: number };
export type PackLayout = Record<string, PackSlice>;

export const PACKED_FOLDERS: readonly string[];
export const PACK_DIR: string;
export function isPacked(file: string): boolean;
export function packLayout(publicDir: string): PackLayout;
export function packFile(slice: PackSlice): string;
export function writePacks(publicDir: string, outDir: string, layout: PackLayout): void;
export function packsIn(layout: PackLayout): string[];
