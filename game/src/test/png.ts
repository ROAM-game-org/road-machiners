import { inflateSync } from 'node:zlib';

export type DecodedPng = { width: number; height: number; data: Uint8Array };

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS = 4;

export function decodePng(bytes: Uint8Array): DecodedPng {
  if (SIGNATURE.some((b, i) => bytes[i] !== b)) throw new Error('Not a PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let header: { width: number; height: number } | null = null;
  const idat: Uint8Array[] = [];
  for (let at = 8; at < bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') header = readHeader(body);
    if (type === 'IDAT') idat.push(body);
    at += length + 12;
  }
  if (!header) throw new Error('PNG has no IHDR');
  const raw = inflateSync(Buffer.concat(idat));
  return { ...header, data: unfilter(raw, header.width, header.height) };
}

function readHeader(body: Uint8Array): { width: number; height: number } {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const [depth, colorType, , , interlace] = body.subarray(8, 13);
  if (depth !== 8 || colorType !== 6 || interlace !== 0) throw new Error(`PNG must be 8-bit RGBA without interlace, got depth ${depth}, color type ${colorType}, interlace ${interlace}`);
  return { width: view.getUint32(0), height: view.getUint32(4) };
}

function unfilter(raw: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * CHANNELS;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const left = x >= CHANNELS ? out[y * stride + x - CHANNELS] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= CHANNELS ? out[(y - 1) * stride + x - CHANNELS] : 0;
      out[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predictor(filter, left, up, upLeft)) & 0xff;
    }
  }
  return out;
}

function predictor(filter: number, left: number, up: number, upLeft: number): number {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return (left + up) >> 1;
  if (filter === 4) return paeth(left, up, upLeft);
  throw new Error(`PNG filter ${filter} is unknown`);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}
