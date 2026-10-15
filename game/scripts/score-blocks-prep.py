import json
import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np

BEATS_PER_BAR = 4
CYMBAL_HZ = 5000
DEMUCS_MODEL = "htdemucs_6s"
HIT_DB = 6
SILENT_DB = 30
MAX_SILENT_BEATS = 8
PHRASE_BARS = 8
EDGE_SECONDS = 0.5
ENTRY_STEPS = 16
CYMBALS_UNDER_DB = 14
OPUS_KBPS = 96
SAMPLE_RATE = 48000


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


def bar_times(song_path, bars):
    first, beat, length = beat_grid(song_path, bars["bpm"])
    start = first - round(first / beat) * beat
    if start - beat * BEATS_PER_BAR >= -beat / 2:
        start -= beat * BEATS_PER_BAR
    print(f"bar 1 starts at {start:.3f} s")
    return (start + BEATS_PER_BAR * beat * np.arange(bars["bars"] + 1)).tolist(), length


def bar_power(song_path, guitars_path, bars):
    song, sr = librosa.load(song_path, sr=None, mono=True)
    guitars, _ = librosa.load(guitars_path, sr=sr, mono=True)
    out = []
    for a, b in zip(bars, bars[1:]):
        lo, hi = max(0, int(a * sr)), int(b * sr)
        s, g = song[lo:hi], guitars[lo:hi]
        out.append({"ss": float(np.mean(s * s)), "gg": float(np.mean(g * g)), "sg": float(np.mean(s * g))})
    return out


def loudest_wall(cymbals_path, bars, sections):
    y, sr = librosa.load(cymbals_path, sr=None, mono=True)
    span = lambda s: y[int(bars[s["from"] - 1] * sr) : int(bars[s["from"] - 1 + s["bars"]] * sr)]
    walls = [s for s in sections if s["role"] == "wall"]
    return max(walls, key=lambda s: float(np.mean(span(s) ** 2)))


def encode(src, out, start=None, seconds=None):
    trim = [] if start is None else ["-ss", f"{start:.6f}", "-t", f"{seconds:.6f}"]
    subprocess.run(["ffmpeg", "-v", "error", "-y", *trim, "-i", src, "-ar", str(SAMPLE_RATE), "-c:a", "libopus", "-b:a", f"{OPUS_KBPS}k", "-map_metadata", "-1", str(out)], check=True)


def cymbals(drums_path, out, bars, sections):
    whole = Path(drums_path).with_name("cymbals.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", drums_path, "-af", f"highpass=f={CYMBAL_HZ},highpass=f={CYMBAL_HZ}", str(whole)], check=True)
    wall = loudest_wall(str(whole), bars, sections)
    start = bars[wall["from"] - 1] - EDGE_SECONDS
    seconds = bars[wall["from"] - 1 + PHRASE_BARS] + EDGE_SECONDS - start
    encode(str(whole), out, start, seconds)
    print(f"cymbals come from the wall at bar {wall['from']}, {seconds:.1f} s")
    return {"file": out.name, "from": wall["from"], "start": start}


def cymbal_lane(song_path, drums_path, out, bars, sections):
    lane = cymbals(drums_path, out, bars, sections)
    return {**lane, "gain": cymbal_gain(song_path, str(out), bars)}


def check_hits(song_path, bars, plan):
    y, sr = librosa.load(song_path, sr=22050, mono=True)
    beat = (bars[1] - bars[0]) / BEATS_PER_BAR
    loud = lambda t: 20 * np.log10(np.sqrt(np.mean(y[int(max(0, t) * sr) : int((t + beat) * sr)] ** 2)) + 1e-9)
    intro = next(s for s in plan["sections"] if s["role"] == "intro")
    level = np.median([loud(t) for t in bars[:-1]])
    for bar in [*range(intro["from"], intro["from"] + intro["bars"]), plan["end"]]:
        if loud(bars[bar - 1]) < level - HIT_DB:
            raise ValueError(f"bar {bar} starts {level - loud(bars[bar - 1]):.0f} dB under the song; intro bars and the end bar must hit on beat 1")
    for s in plan["sections"]:
        check_silence(s, [loud(bars[s["from"] - 1] + k * beat) for k in range(s["bars"] * BEATS_PER_BAR)], level)


def bar_entries(song_path, bars):
    y, sr = librosa.load(song_path, sr=22050, mono=True)
    step = (bars[1] - bars[0]) / ENTRY_STEPS
    loud = lambda t: 20 * np.log10(np.sqrt(np.mean(y[int(max(0, t) * sr) : int((t + step) * sr)] ** 2)) + 1e-9)
    level = np.median([loud(t) for t in bars[:-1]])
    return [entry_of([loud(t + k * step) for k in range(ENTRY_STEPS)], level) * step for t in bars[:-1]]


def entry_of(steps, level):
    return next((k for k, db in enumerate(steps) if db >= level - SILENT_DB), 0)


def cymbal_gain(song_path, cymbals_path, bars):
    song, sr = librosa.load(song_path, sr=22050, mono=True)
    cym, _ = librosa.load(cymbals_path, sr=sr, mono=True)
    song_db = np.median([10 * np.log10(np.mean(song[int(max(0, a) * sr) : int(b * sr)] ** 2) + 1e-12) for a, b in zip(bars, bars[1:])])
    cym_db = 10 * np.log10(np.mean(cym**2) + 1e-12)
    print(f"cymbals sit {song_db - cym_db:.1f} dB under the song, lifted to {CYMBALS_UNDER_DB} dB under")
    return float(10 ** ((song_db - CYMBALS_UNDER_DB - cym_db) / 20))


def check_silence(section, beats, level):
    run = 0
    for db in beats:
        run = run + 1 if db < level - SILENT_DB else 0
        if run > MAX_SILENT_BEATS:
            raise ValueError(f"{section['role']} at bar {section['from']} holds more than {MAX_SILENT_BEATS} silent beats; map it shorter so the song never drops into a hole")


def map_song(name, plan, song_path, stems_dir, sfx_dir):
    bars, length = bar_times(song_path, plan)
    check_hits(song_path, bars, plan)
    files = {part: Path(sfx_dir) / f"song-{name}{suffix}-1.ogg" for part, suffix in [("song", ""), ("guitars", "-guitars"), ("cymbals", "-cymbals")]}
    encode(song_path, files["song"])
    encode(f"{stems_dir}/{plan['guitarStem']}", files["guitars"])
    cymbal = cymbal_lane(song_path, f"{stems_dir}/drums.wav", files["cymbals"], bars, plan["sections"])
    power = bar_power(song_path, f"{stems_dir}/{plan['guitarStem']}", bars)
    entries = bar_entries(song_path, bars)
    for s in plan["sections"]:
        print(f"{s['role']} {s['from']}: sound enters {entries[s['from'] - 1]:.2f} s after the bar line")
    print(f"wrote {name} with {len(plan['sections'])} sections, guitar lane from {plan['guitarStem']}")
    return {"title": plan["title"], "file": files["song"].name, "guitars": files["guitars"].name, "cymbals": cymbal, "bpm": plan["bpm"], "length": length, "barTimes": bars, "barPower": power, "barEntry": entries, "sections": plan["sections"], "end": plan["end"]}


def split_once(source, work):
    stems_dir = work / DEMUCS_MODEL / source.stem
    if not (stems_dir / "drums.wav").exists():
        subprocess.run([sys.executable, "-m", "demucs", "-n", DEMUCS_MODEL, "-o", str(work), str(source)], check=True)
    return stems_dir


def main(songs_path, sources_dir, sfx_dir, out_path):
    work = Path(sources_dir) / "stems"
    songs = {}
    for name, plan in json.loads(Path(songs_path).read_text()).items():
        source = Path(sources_dir) / plan["source"]
        if not source.exists():
            raise FileNotFoundError(f"{name} needs {source}")
        songs[name] = map_song(name, plan, str(source), split_once(source, work), sfx_dir)
    Path(out_path).write_text(json.dumps(songs, indent=1) + "\n")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main(*sys.argv[1:])
