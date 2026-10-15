import json
import shutil
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

BEATS_PER_BAR = 4
KICK_HZ = 120
STFT_SIZE = 4096
CENTER_SHARPNESS = 4
LEAD_MARGIN_SECONDS = 0.05


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


def center(stereo, sr):
    left, right = (librosa.stft(np.ascontiguousarray(stereo[:, c]).astype(np.float32), n_fft=STFT_SIZE) for c in (0, 1))
    alike = 2 * np.real(left * np.conj(right)) / (np.abs(left) ** 2 + np.abs(right) ** 2 + 1e-12)
    mask = np.clip(alike, 0, 1) ** CENTER_SHARPNESS
    return librosa.istft(mask * (left + right) / 2, n_fft=STFT_SIZE, length=len(stereo))


def rms_db(y):
    return 20 * np.log10(np.sqrt(np.mean(y**2)) + 1e-9)


def cut_lead(other_path, bars, lead, out):
    stereo, sr = sf.read(other_path, always_2d=True)
    lead_only = center(stereo, sr)
    span = lambda first, count: lead_only[int(bars[first - 1] * sr) : int(bars[first - 1 + count] * sr)]
    wall = rms_db(span(lead["quietFrom"], lead["bars"]))
    solo = rms_db(span(lead["from"], lead["bars"]))
    print(f"center of the guitar stem: solo bars {solo:.1f} dB, wall bars without lead {wall:.1f} dB")
    start = bars[lead["from"] - 1] - LEAD_MARGIN_SECONDS
    y = lead_only[int(start * sr) : int((bars[lead["from"] - 1 + lead["bars"]] + LEAD_MARGIN_SECONDS) * sr)]
    sf.write(out, y, sr)
    return {"file": out.name, "start": start, "from": lead["from"], "bars": lead["bars"]}


def main(map_path, song_path, stems_dir, out_dir):
    plan = json.loads(Path(map_path).read_text())
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    bars, length = bar_times(song_path, f"{stems_dir}/drums.wav", plan["bpm"], plan["bars"])
    shutil.copy(song_path, out / "song.mp3")
    lead = cut_lead(f"{stems_dir}/other.wav", bars, plan["lead"], out / "lead.wav")
    song = {"file": "song.mp3", "bpm": plan["bpm"], "length": length, "barTimes": bars, "sections": plan["sections"], "end": plan["end"], "lead": lead}
    (out / "song.json").write_text(json.dumps(song, indent=1))
    print(f"wrote {out / 'song.json'} with {len(plan['sections'])} sections and a {lead['bars']} bar lead")


if __name__ == "__main__":
    main(*sys.argv[1:])
