import json
import shutil
import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np

BEATS_PER_BAR = 4
KICK_HZ = 120
CYMBAL_HZ = 5000
STEMS = {"drums": "drums.wav", "guitars": "other.wav"}


def beat_grid(path, bpm):
    y, sr = librosa.load(path, sr=22050, mono=True)
    _, frames = librosa.beat.beat_track(y=y, sr=sr, start_bpm=bpm, units="frames")
    beats = librosa.frames_to_time(frames, sr=sr)
    index = np.round((beats - beats[0]) * bpm / 60)
    beat, first = np.polyfit(index, beats, 1)
    for _ in range(3):
        kept = np.abs(beats - (first + beat * index)) < beat / 8
        beat, first = np.polyfit(index[kept], beats[kept], 1)
    off = np.abs(beats - (first + beat * index))[kept] * 1000
    print(f"fitted {60 / beat:.3f} BPM, first beat {first:.3f} s, {kept.sum()} of {len(beats)} beats on the grid, median {np.median(off):.1f} ms, p95 {np.percentile(off, 95):.1f} ms off")
    return first, beat, len(y) / sr


def downbeat_phase(drums_path, first, beat):
    y, sr = librosa.load(drums_path, sr=22050, mono=True)
    spec = np.abs(librosa.stft(y, n_fft=2048, hop_length=256))
    low = librosa.fft_frequencies(sr=sr, n_fft=2048) < KICK_HZ
    env = librosa.onset.onset_strength(S=librosa.amplitude_to_db(spec[low]), sr=sr, hop_length=256)
    times = librosa.frames_to_time(np.arange(len(env)), sr=sr, hop_length=256)
    beats = np.arange(first, times[-1] - beat, beat)
    strength = np.array([env[(times >= t - 0.03) & (times < t + 0.05)].max() for t in beats])
    by_phase = [strength[p::BEATS_PER_BAR].mean() for p in range(BEATS_PER_BAR)]
    print("kick onset by beat phase", np.round(by_phase, 2))
    return int(np.argmax(by_phase))


def bar_times(song_path, drums_path, bpm, bars):
    first, beat, length = beat_grid(song_path, bpm)
    phase = downbeat_phase(drums_path, first, beat)
    start = first + phase * beat
    if start - beat * BEATS_PER_BAR >= -beat / 2:
        start -= beat * BEATS_PER_BAR
    print(f"bar 1 starts at {start:.3f} s")
    return (start + BEATS_PER_BAR * beat * np.arange(bars + 1)).tolist(), length


def bar_power(song_path, guitars_path, bars):
    song, sr = librosa.load(song_path, sr=None, mono=True)
    guitars, _ = librosa.load(guitars_path, sr=sr, mono=True)
    out = []
    for a, b in zip(bars, bars[1:]):
        s, g = song[int(a * sr) : int(b * sr)], guitars[int(a * sr) : int(b * sr)]
        out.append({"ss": float(np.mean(s * s)), "gg": float(np.mean(g * g)), "sg": float(np.mean(s * g))})
    return out


def cymbals(drums_path, out, bars, sections, song_path):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", drums_path, "-af", f"highpass=f={CYMBAL_HZ},highpass=f={CYMBAL_HZ}", str(out)], check=True)
    cym, sr = librosa.load(str(out), sr=None, mono=True)
    song, _ = librosa.load(song_path, sr=sr, mono=True)
    span = lambda y, s: y[int(bars[s["from"] - 1] * sr) : int(bars[s["from"] - 1 + s["bars"]] * sr)]
    walls = [s for s in sections if s["role"] == "wall"]
    loudest = max(walls, key=lambda s: float(np.mean(span(cym, s) ** 2)))
    for s in sections:
        a, c = span(song, s), span(cym, s)
        lift = 10 * np.log10(np.mean((a + c) ** 2) / np.mean(a**2))
        print(f"{s['role']} {s['from']}: cymbals {10 * np.log10(np.mean(c ** 2)):.1f} dB, a same-strength layer lifts the mix {lift:.1f} dB")
    print(f"cymbals come from the wall at bar {loudest['from']}")
    return {"file": out.name, "from": loudest["from"]}


def main(map_path, song_path, stems_dir, out_dir):
    plan = json.loads(Path(map_path).read_text())
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    bars, length = bar_times(song_path, f"{stems_dir}/drums.wav", plan["bpm"], plan["bars"])
    shutil.copy(song_path, out / "song.mp3")
    for name, stem in STEMS.items():
        shutil.copy(f"{stems_dir}/{stem}", out / f"{name}.wav")
    power = bar_power(song_path, f"{stems_dir}/{STEMS['guitars']}", bars)
    cymbal = cymbals(f"{stems_dir}/{STEMS['drums']}", out / "cymbals.wav", bars, plan["sections"], song_path)
    song = {"file": "song.mp3", "stems": {name: f"{name}.wav" for name in STEMS}, "cymbals": cymbal, "bpm": plan["bpm"], "length": length, "barTimes": bars, "barPower": power, "sections": plan["sections"], "end": plan["end"]}
    (out / "song.json").write_text(json.dumps(song, indent=1))
    print(f"wrote {out / 'song.json'} with {len(plan['sections'])} sections and stems {', '.join(STEMS)}")


if __name__ == "__main__":
    main(*sys.argv[1:])
