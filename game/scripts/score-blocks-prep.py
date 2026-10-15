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
DEMUCS_MODEL = "htdemucs_6s"
HIT_DB = 6


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


def bar_times(song_path, drums_path, bpm, bars, planned):
    first, beat, length = beat_grid(song_path, bpm)
    if planned:
        first -= round(first / beat) * beat
    phase = 0 if planned else downbeat_phase(drums_path, first, beat)
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
        lo, hi = max(0, int(a * sr)), int(b * sr)
        s, g = song[lo:hi], guitars[lo:hi]
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


def check_hits(song_path, bars, plan):
    y, sr = librosa.load(song_path, sr=22050, mono=True)
    beat = (bars[1] - bars[0]) / BEATS_PER_BAR
    loud = lambda t: 20 * np.log10(np.sqrt(np.mean(y[int(max(0, t) * sr) : int((t + beat) * sr)] ** 2)) + 1e-9)
    intro = next(s for s in plan["sections"] if s["role"] == "intro")
    level = np.median([loud(t) for t in bars[:-1]])
    for bar in [*range(intro["from"], intro["from"] + intro["bars"]), plan["end"]]:
        if loud(bars[bar - 1]) < level - HIT_DB:
            raise ValueError(f"bar {bar} starts {level - loud(bars[bar - 1]):.0f} dB under the song; intro bars and the end bar must hit on beat 1")


def map_song(plan, song_path, stems_dir, guitar_stem, out_dir):
    stems = {"drums": "drums.wav", "guitars": guitar_stem}
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    bars, length = bar_times(song_path, f"{stems_dir}/drums.wav", plan["bpm"], plan["bars"], plan.get("barOneAtFirstBeat", False))
    check_hits(song_path, bars, plan)
    song_file = f"song{Path(song_path).suffix}"
    shutil.copy(song_path, out / song_file)
    for name, stem in stems.items():
        shutil.copy(f"{stems_dir}/{stem}", out / f"{name}.wav")
    power = bar_power(song_path, f"{stems_dir}/{guitar_stem}", bars)
    cymbal = cymbals(f"{stems_dir}/drums.wav", out / "cymbals.wav", bars, plan["sections"], song_path)
    song = {"file": song_file, "stems": {name: f"{name}.wav" for name in stems}, "cymbals": cymbal, "bpm": plan["bpm"], "length": length, "barTimes": bars, "barPower": power, "sections": plan["sections"], "end": plan["end"]}
    (out / "song.json").write_text(json.dumps(song, indent=1))
    print(f"wrote {out / 'song.json'} with {len(plan['sections'])} sections, guitar lane from {guitar_stem}")


def split_once(source, work):
    stems_dir = work / DEMUCS_MODEL / source.stem
    if not (stems_dir / "drums.wav").exists():
        subprocess.run([sys.executable, "-m", "demucs", "-n", DEMUCS_MODEL, "-o", str(work), str(source)], check=True)
    return stems_dir


def build_songs(songs_path, sources_dir, out_root):
    work = Path(sources_dir) / "stems"
    for name, entry in json.loads(Path(songs_path).read_text()).items():
        source = Path(sources_dir) / entry["source"]
        if not source.exists():
            raise FileNotFoundError(f"{name} needs {source}")
        plan = {**entry, "barOneAtFirstBeat": True}
        map_song(plan, str(source), split_once(source, work), entry["guitarStem"], Path(out_root) / name)


def main(map_path, song_path, stems_dir, guitar_stem, out_dir):
    map_song(json.loads(Path(map_path).read_text()), song_path, stems_dir, guitar_stem, out_dir)


if __name__ == "__main__":
    (build_songs if len(sys.argv) == 4 else main)(*sys.argv[1:])
