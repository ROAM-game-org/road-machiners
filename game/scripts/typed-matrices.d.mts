import type { Plugin } from 'vite';

export function typedMatrixCode(code: string, id: string): string | null;
export function typedMatrices(): Plugin;
export function typedMatricesWhilePrebundling(): { name: string; setup: (build: unknown) => void };
