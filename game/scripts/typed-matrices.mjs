const EDITS = [
  { file: 'three/build/three.core.js', from: /(class Matrix3 \{[\s\S]*?this\.elements = )\[(\s*1, 0, 0,\s*0, 1, 0,\s*0, 0, 1\s*)\];/, to: '$1new Float64Array( [$2] );' },
  { file: 'three/build/three.core.js', from: /(class Matrix4 \{[\s\S]*?this\.elements = )\[(\s*1, 0, 0, 0,\s*0, 1, 0, 0,\s*0, 0, 1, 0,\s*0, 0, 0, 1\s*)\];/, to: '$1new Float64Array( [$2] );' },
  { file: 'three/build/three.module.js', from: /_m0\.elements\.map\( \( v \) => v\.toFixed\( 4 \) \)/, to: 'Array.from( _m0.elements, ( v ) => v.toFixed( 4 ) )' },
];

export function typedMatrixCode(code, id) {
  const edits = EDITS.filter((edit) => id.includes(edit.file));
  if (edits.length === 0) return null;
  for (const edit of edits) if (!edit.from.test(code)) throw new Error(`three no longer has ${edit.from} in ${edit.file}`);
  return edits.reduce((text, edit) => text.replace(edit.from, edit.to), code);
}

export function typedMatricesWhilePrebundling() {
  return {
    name: 'typed-matrices',
    setup(build) {
      build.onLoad({ filter: /three[\\/]build[\\/]three\.(core|module)\.js$/ }, async ({ path }) => {
        const { readFile } = await import('node:fs/promises');
        return { contents: typedMatrixCode(await readFile(path, 'utf8'), path.replaceAll('\\', '/')), loader: 'js' };
      });
    },
  };
}

export function typedMatrices() {
  return {
    name: 'typed-matrices',
    enforce: 'pre',
    transform(code, id) {
      const edited = typedMatrixCode(code, id);
      return edited === null ? null : { code: edited, map: null };
    },
  };
}
