function chunkOf(owner: string, source: string, chunk: string): string {
  if (!source.includes(chunk)) throw new Error(`${owner} cannot patch a shader without ${chunk}`);
  return chunk;
}

export function injectAfter(owner: string, source: string, chunk: string, code: string): string {
  return source.replace(chunkOf(owner, source, chunk), `${chunk}\n${code}`);
}

export function injectBefore(owner: string, source: string, chunk: string, code: string): string {
  return source.replace(chunkOf(owner, source, chunk), `${code}\n${chunk}`);
}

export function replaceChunk(owner: string, source: string, chunk: string, code: string): string {
  return source.replace(chunkOf(owner, source, chunk), code);
}
