import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

RAMP = [0x1a1410, 0x3a2418, 0x5e3420, 0x8a5e44, 0xb47f5d, 0xd9a878, 0xf0d2a8, 0xf4e8d4]
RAMP_STEPS = 12
COLOR_KEEP = 0.6
ORIGINAL_MIX = 0.5
GRAIN = 6
SEED = 7
WEBP_QUALITY = 85
OUT_DIR = Path(__file__).resolve().parents[2] / 'public' / 'quest-art'


def ramp_lut():
    stops = np.array([[(c >> 16) & 255, (c >> 8) & 255, c & 255] for c in RAMP], np.float32)
    pos = np.linspace(0, 1, len(RAMP))
    x = np.linspace(0, 1, 256)
    return np.stack([np.interp(x, pos, stops[:, i]) for i in range(3)], axis=1)


def gradient_map(a):
    luma = (a[..., 0] * 0.3 + a[..., 1] * 0.6 + a[..., 2] * 0.1) / 255
    lo, hi = np.percentile(luma, [1, 99])
    luma = np.clip((luma - lo) / (hi - lo), 0, 1)
    stepped = np.round(luma * RAMP_STEPS) / RAMP_STEPS
    return ramp_lut()[(stepped * 255).astype(np.int32)]


def process(src):
    img = Image.open(src).convert('RGB').filter(ImageFilter.ModeFilter(3))
    a = np.asarray(img).astype(np.float32)
    mapped = gradient_map(a)
    grey = a.mean(axis=2, keepdims=True)
    tint = (a - grey) * COLOR_KEEP
    out = (mapped + tint) * (1 - ORIGINAL_MIX) + a * ORIGINAL_MIX
    out += np.random.default_rng(SEED).normal(0, GRAIN, a.shape[:2])[..., None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def main():
    if len(sys.argv) != 3:
        sys.exit('usage: npm run quest-art -- <source image> <key>')
    src, key = Path(sys.argv[1]), sys.argv[2]
    dst = OUT_DIR / f'{key}.webp'
    process(src).save(dst, quality=WEBP_QUALITY)
    print(dst)
    subprocess.run([sys.executable, '-I', str(Path(__file__).with_name('crops.py')), key], check=True)


main()
