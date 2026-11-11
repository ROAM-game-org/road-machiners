import { describe, expect, it } from 'vitest';
import { injectAfter, injectBefore, replaceChunk } from './shaderPatch';

const SOURCE = 'void main() {\n#include <map_fragment>\n}';

describe('shader patches', () => {
  it('puts code after, before or in place of the chunk', () => {
    expect(injectAfter('Test', SOURCE, '#include <map_fragment>', 'x();')).toBe('void main() {\n#include <map_fragment>\nx();\n}');
    expect(injectBefore('Test', SOURCE, '#include <map_fragment>', 'x();')).toBe('void main() {\nx();\n#include <map_fragment>\n}');
    expect(replaceChunk('Test', SOURCE, '#include <map_fragment>', 'x();')).toBe('void main() {\nx();\n}');
  });

  it('names its owner and the missing chunk instead of patching nothing', () => {
    expect(() => injectAfter('drawn-ground', SOURCE, '#include <opaque_fragment>', 'x();')).toThrow('drawn-ground cannot patch a shader without #include <opaque_fragment>');
    expect(() => injectBefore('Test', SOURCE, '#include <common>', 'x();')).toThrow();
    expect(() => replaceChunk('Test', SOURCE, '#include <common>', 'x();')).toThrow();
  });
});
