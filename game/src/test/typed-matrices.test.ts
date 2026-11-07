import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { typedMatrixCode } from '../../scripts/typed-matrices.mjs';

const CORE = 'node_modules/three/build/three.core.js';
const MODULE = 'node_modules/three/build/three.module.js';

function edited(file: string): string {
  const code = typedMatrixCode(readFileSync(file, 'utf8'), file);
  if (code === null) throw new Error(`${file} was not edited`);
  return code;
}

function classBody(code: string, name: string): string {
  const start = code.indexOf(`class ${name} {`);
  return code.slice(start, start + 2000);
}

describe('typed matrices', () => {
  it('stores Matrix3 and Matrix4 of the installed three in typed arrays', () => {
    const code = edited(CORE);
    expect(classBody(code, 'Matrix3')).toContain('this.elements = new Float64Array(');
    expect(classBody(code, 'Matrix4')).toContain('this.elements = new Float64Array(');
  });

  it('leaves three text numbers in the color conversion shader', () => {
    expect(edited(MODULE)).toContain('Array.from( _m0.elements, ( v ) => v.toFixed( 4 ) )');
  });

  it('leaves other files alone', () => {
    expect(typedMatrixCode('const a = 1;', 'src/game.ts')).toBeNull();
  });

  it('fails loudly when three changes the text it edits', () => {
    expect(() => typedMatrixCode('class Matrix4 {}', CORE)).toThrow('three no longer has');
  });
});
