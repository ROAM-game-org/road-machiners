import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

COLUMN_RATIO = 3 / 4
BAND_RATIO = 3
WIDEST_COLUMN = 1
ZOOM = 1.08
TALK_WIDTH = 260
ROOT = Path(__file__).resolve().parents[2]
FOCUS_FILE = ROOT / 'src' / 'data' / 'quest-art.json'
ART_DIR = ROOT / 'public' / 'quest-art'
OUT_DIR = ROOT / 'tmp' / 'quest-art'
SHEET_HEIGHT = 300
GAP = 16
CAPTION_HEIGHT = 18
BACKGROUND = (28, 22, 18)
MARK = (80, 255, 120)
ZONE = (255, 70, 70)
CAPTION = (240, 225, 200)


def window(size, focus, ratio):
    width, height = size
    if width / height > ratio:
        shown_w, shown_h = height * ratio, height
    else:
        shown_w, shown_h = width, width / ratio
    shown_w, shown_h = shown_w / ZOOM, shown_h / ZOOM
    left = focus[0] * width - focus[0] * shown_w
    top = focus[1] * height - focus[1] * shown_h
    return left, top, left + shown_w, top + shown_h


def crop(img, focus, ratio):
    return img.crop(tuple(round(v) for v in window(img.size, focus, ratio)))


def safe_zone(size, focus):
    column = window(size, focus, COLUMN_RATIO)
    band = window(size, focus, BAND_RATIO)
    zone_w, zone_h = column[2] - column[0], band[3] - band[1]
    left = focus[0] * size[0] - focus[0] * zone_w
    top = focus[1] * size[1] - focus[1] * zone_h
    return left, top, left + zone_w, top + zone_h


def talk_view(img, focus):
    scale = TALK_WIDTH / img.width
    view = img.resize((TALK_WIDTH, round(img.height * scale))).convert('RGB')
    draw = ImageDraw.Draw(view)
    draw.rectangle([v * scale for v in safe_zone(img.size, focus)], outline=ZONE, width=2)
    x, y = focus[0] * view.width, focus[1] * view.height
    draw.line([x - 6, y, x + 6, y], fill=MARK, width=2)
    draw.line([x, y - 6, x, y + 6], fill=MARK, width=2)
    return view


def fit_height(img):
    return img.resize((round(img.width * SHEET_HEIGHT / img.height), SHEET_HEIGHT)).convert('RGB')


def sheet(key, entry):
    img = Image.open(ART_DIR / entry['file'])
    focus = (entry['focusX'] / 100, entry['focusY'] / 100)
    views = [
        ('talk 260px, safe zone', talk_view(img, focus)),
        ('column 3:4', fit_height(crop(img, focus, COLUMN_RATIO))),
        ('column 1:1', fit_height(crop(img, focus, WIDEST_COLUMN))),
        ('band 3:1', fit_height(crop(img, focus, BAND_RATIO))),
    ]
    width = sum(v.width for _, v in views) + GAP * (len(views) + 1)
    out = Image.new('RGB', (width, SHEET_HEIGHT + CAPTION_HEIGHT * 2 + GAP * 2), BACKGROUND)
    draw = ImageDraw.Draw(out)
    draw.text((GAP, 4), f"{key}  focus {entry['focusX']}% {entry['focusY']}%", fill=CAPTION)
    x = GAP
    for caption, view in views:
        draw.text((x, CAPTION_HEIGHT + 2), caption, fill=CAPTION)
        out.paste(view, (x, CAPTION_HEIGHT * 2 + GAP // 2))
        x += view.width + GAP
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dst = OUT_DIR / f'{key}.png'
    out.save(dst)
    return dst


def main():
    entries = json.loads(FOCUS_FILE.read_text())
    keys = sys.argv[1:] or list(entries)
    unknown = [k for k in keys if k not in entries]
    if unknown:
        sys.exit(f"No quest art {', '.join(unknown)} in src/data/quest-art.json. Add its key with focusX and focusY first.")
    for key in keys:
        print(sheet(key, entries[key]))


main()
