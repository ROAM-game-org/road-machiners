from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).resolve().parent / 'source'
OUT = ROOT / 'public' / 'hud'
WEBP_QUALITY = 88
HOUSING_LIGHT_REF = 0.5
HOUSING_HUE = (20, 60)
RECESS_LIGHT = 0.17
RECESS_AREA = 1500
HOUSING_MIN_SAT = 0.1
MASK_BLUR_PX = 1.2
MASK_SPECK_AREA = 600
KEEP_LIGHT = 0.45
KEEP_GROW = 3
PAINT_SAT = 0.35
EVEN_FACE_RED = 150
EVEN_FACE_BLUR = 30
EVEN_FACE_MIN_SAT = 0.6

PLATES = {
    'drive': {'width': 1633, 'painted': True},
    'weapons': {'width': 1969, 'painted': True},
    'radio': {'width': 1279, 'painted': True},
}
PAINTED = {'drive-hood': 1633, 'drive-back': 1633, 'visor': 420, 'rail': 1000}
KIT = {
    'tape': ('weapons', [(0, 0, 167, 76)]),
    'lamp': ('weapons', [(8, 8, 56, 56)]),
    'knob': ('radio', []),
    'keycap': ('drive', [(0, 0, 328, 394)]),
    'keycap-lit': ('drive', [(0, 0, 328, 394)]),
    'rocker-off': ('drive', []),
    'rocker-on': ('drive', []),
    'wheel': ('radio', [(0, 0, 247, 240)]),
    'glass': ('drive', [(0, 0, 512, 512)]),
    'olive': ('drive', [(0, 0, 512, 512)]),
    'playkey': ('drive', [(0, 0, 246, 160)]),
    'rim': ('drive', [(0, 0, 90, 90)]),
    'well': ('drive', [(0, 0, 90, 90)]),
}


def hls(rgb):
    top, bottom = rgb.max(axis=2), rgb.min(axis=2)
    light = (top + bottom) / 2
    span = top - bottom
    spread = np.where(light < 0.5, top + bottom, 2 - top - bottom)
    sat = np.where(spread == 0, 0, span / np.where(spread == 0, 1, spread))
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    safe = np.where(span == 0, 1, span)
    hue = np.where(top == r, ((g - b) / safe) % 6, np.where(top == g, (b - r) / safe + 2, (r - g) / safe + 4)) * 60
    return np.where(span == 0, 0, hue), light, sat


def small_parts(mask):
    labels, count = ndimage.label(mask)
    if count == 0:
        return np.zeros_like(mask)
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    return np.isin(labels, np.nonzero(sizes < MASK_SPECK_AREA)[0] + 1)


def without_specks(mask):
    filled = mask | small_parts(~mask)
    return filled & ~small_parts(filled)


def housing_mask(rgba, keep, strict):
    hue, light, sat = hls(rgba[..., :3] / 255)
    solid = rgba[..., 3] > 200
    dark = ndimage.binary_opening(solid & (light < RECESS_LIGHT), iterations=2)
    labels, count = ndimage.label(dark)
    sizes = ndimage.sum(dark, labels, range(1, count + 1)) if count else np.array([])
    recesses = ndimage.binary_dilation(np.isin(labels, np.nonzero(sizes >= RECESS_AREA)[0] + 1), iterations=1)
    mask = solid & ~recesses & (sat >= HOUSING_MIN_SAT) & (hue >= HOUSING_HUE[0]) & (hue <= HOUSING_HUE[1])
    for x0, y0, x1, y1 in keep:
        if strict:
            mask[y0:y1, x0:x1] = False
            continue
        lit = ndimage.binary_dilation(light[y0:y1, x0:x1] > KEEP_LIGHT, iterations=KEEP_GROW)
        mask[y0:y1, x0:x1] &= ~lit
    metal = solid & ~recesses & ~((sat > PAINT_SAT) & ((hue < HOUSING_HUE[0]) | (hue > HOUSING_HUE[1])))
    for x0, y0, x1, y1 in keep:
        metal[y0:y1, x0:x1] &= ~ndimage.binary_dilation(light[y0:y1, x0:x1] > KEEP_LIGHT, iterations=KEEP_GROW)
    return soft_mask(without_specks(mask)), soft_mask(without_specks(metal)), light


def soft_mask(mask):
    soft = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(MASK_BLUR_PX))
    return np.array(soft).astype(float) / 255


def save_mask(mask, alpha_source, size, path):
    holder = np.zeros((*mask.shape, 4), np.uint8)
    holder[..., 3] = (mask * alpha_source).astype(np.uint8)
    Image.fromarray(holder).resize(size, Image.LANCZOS).save(path, quality=WEBP_QUALITY)


def plate(name, spec):
    src = Image.open(SOURCE / f'{name}.webp').convert('RGBA')
    if 'scale' in spec:
        spec = {**spec, 'width': round(src.width * spec['scale'])}
    rgba = np.array(src).astype(float)
    if spec.get('painted', False):
        mask = metal = np.zeros(rgba.shape[:2])
        rgb = rgba[..., :3]
    else:
        mask, metal, light = housing_mask(rgba, spec['keep'], spec.get('strict', False))
        gray = np.clip(light / HOUSING_LIGHT_REF, 0, 1)[..., None] * 255
        rgb = rgba[..., :3] * (1 - mask[..., None]) + gray * mask[..., None]
    out = np.dstack([rgb, rgba[..., 3]]).astype(np.uint8)
    height = round(src.height * spec['width'] / src.width)
    size = (spec['width'], height)
    Image.fromarray(out).resize(size, Image.LANCZOS).save(OUT / f'{name}.webp', quality=WEBP_QUALITY)
    save_mask(mask, rgba[..., 3], size, OUT / f'{name}-housing.webp')
    if spec.get('patina', False):
        save_mask(metal, rgba[..., 3], size, OUT / f'{name}-patina.webp')
    print(f'{name}: {src.width}x{src.height} -> {size[0]}x{size[1]}, housing share {mask.mean():.2f}')
    return spec['width'] / src.width


def even_face(source, name):
    rgba = np.array(Image.open(OUT / f'{source}.webp').convert('RGBA')).astype(float)
    hue, light, sat = hls(rgba[..., :3] / 255)
    face = soft_mask((sat > EVEN_FACE_MIN_SAT) & ((hue < 20) | (hue > 340)) & (rgba[..., 3] > 200))
    glow = ndimage.gaussian_filter(rgba[..., 0], EVEN_FACE_BLUR)
    flat = rgba[..., :3] * (EVEN_FACE_RED / np.maximum(glow, 1))[..., None]
    rgb = rgba[..., :3] * (1 - face[..., None]) + np.clip(flat, 0, 255) * face[..., None]
    Image.fromarray(np.dstack([rgb, rgba[..., 3]]).astype(np.uint8)).save(OUT / f'{name}.webp', quality=WEBP_QUALITY)
    print(f'{name}: even face from {source}, face share {face.mean():.2f}')


def painted(name, width):
    src = Image.open(SOURCE / f'{name}.webp').convert('RGBA')
    size = (width, round(src.height * width / src.width))
    src.resize(size, Image.LANCZOS).save(OUT / f'{name}.webp', quality=WEBP_QUALITY)
    print(f'{name}: {src.width}x{src.height} -> {size[0]}x{size[1]}, painted')


def main():
    (OUT / 'kit').mkdir(parents=True, exist_ok=True)
    scales = {name: plate(name, {**spec, 'patina': True}) for name, spec in PLATES.items()}
    for name, (owner, keep) in KIT.items():
        plate(f'kit/{name}', {'scale': scales[owner], 'keep': keep, 'strict': True})
    even_face('kit/keycap-lit', 'kit/keycap-red')
    for name, width in PAINTED.items():
        painted(name, width)


main()
