import importlib.util
import json
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

PARTS = {"drums": ["drums"], "bass": ["bass"], "guitar": ["guitar", "piano", "other"], "vocals": ["vocals"]}
PUSHED = "guitar"


def block_prep():
    spec = importlib.util.spec_from_file_location("block_prep", Path(__file__).with_name("score-blocks-prep.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_parts(stems_dir):
    parts = {}
    for part, names in PARTS.items():
        audio, rate = sf.read(f"{stems_dir}/{names[0]}.wav", dtype="float32")
        for name in names[1:]:
            audio += sf.read(f"{stems_dir}/{name}.wav", dtype="float32")[0]
        parts[part] = audio
    return parts, rate


def bar_power(mix, pushed, rate, bars):
    out = []
    for a, b in zip(bars, bars[1:]):
        s, g = mix[int(a * rate) : int(b * rate)].mean(axis=1), pushed[int(a * rate) : int(b * rate)].mean(axis=1)
        out.append({"ss": float(np.mean(s * s)), "gg": float(np.mean(g * g)), "sg": float(np.mean(s * g))})
    return out


def loudness_match(mix, rate, reference_path):
    reference, _ = librosa.load(reference_path, sr=rate, mono=True)
    scale = np.sqrt(np.mean(reference**2) / np.mean(mix.mean(axis=1) ** 2))
    print(f"parts scaled by {20 * np.log10(scale):.1f} dB to match {reference_path}")
    return scale


def main(plan_path, stems_dir, reference_path, out_dir):
    plan = json.loads(Path(plan_path).read_text())
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    parts, rate = read_parts(stems_dir)
    scale = loudness_match(sum(parts.values()), rate, reference_path)
    parts = {part: audio * scale for part, audio in parts.items()}
    mix = sum(parts.values())
    mix_path = out / "mix.wav"
    sf.write(mix_path, mix, rate)
    prep = block_prep()
    bars, length = prep.bar_times(str(mix_path), f"{stems_dir}/drums.wav", plan["bpm"], plan["bars"])
    for part, audio in parts.items():
        sf.write(out / f"{part}.wav", audio, rate, subtype="PCM_16")
    cymbals = prep.cymbals(str(out / "drums.wav"), out / "cymbals.wav", bars, plan["sections"], str(mix_path))
    song = {"parts": {part: f"{part}.wav" for part in PARTS}, "cymbals": cymbals, "bpm": plan["bpm"], "length": length, "barTimes": bars, "barPower": bar_power(mix, parts[PUSHED], rate, bars), "sections": plan["sections"], "end": plan["end"]}
    (out / "song.json").write_text(json.dumps(song, indent=1))
    print(f"wrote {out / 'song.json'} with {len(plan['sections'])} sections and parts {', '.join(PARTS)}")


if __name__ == "__main__":
    main(*sys.argv[1:])
