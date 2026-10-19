import json
import os
import sys
from pathlib import Path

import librosa
import numpy as np

BEATS_PER_BAR = 4
ANALYSIS_RATE = 22050
MELS = 40
FFT = 1024
HOP = 256
FLOOR_DB = 60
BLOCK_BARS = 2
CHORD_BARS = range(-4, 0)
QUIET_DB = 24


class Song:
    def __init__(self, path, bars):
        self.audio, _ = librosa.load(path, sr=ANALYSIS_RATE, mono=True)
        self.bars = bars
        self.beat = (bars[1] - bars[0]) / BEATS_PER_BAR
        self.loudest = self.mel_power(self.audio).mean(axis=1).max()
        self.rms = np.sqrt(np.mean(self.audio ** 2))
        self.beats = {}
        self.chords = {}

    def mel_power(self, y):
        return librosa.feature.melspectrogram(y=y, sr=ANALYSIS_RATE, n_mels=MELS, n_fft=FFT, hop_length=HOP, center=False)

    def slice(self, start, end):
        return self.audio[max(0, int(start * ANALYSIS_RATE)):int(end * ANALYSIS_RATE)]

    def beat_at(self, t):
        key = round(t, 4)
        if key not in self.beats:
            db = librosa.power_to_db(self.mel_power(self.slice(t, t + self.beat)), ref=self.loudest, top_db=None)
            self.beats[key] = np.maximum(db, -FLOOR_DB)
        return self.beats[key]

    def chord(self, bar):
        if bar not in self.chords:
            y = self.slice(self.bars[bar - 1], self.bars[bar])
            if len(y) < FFT:
                self.chords[bar] = None
                return None
            silent = librosa.power_to_db(self.mel_power(y).mean(), ref=self.loudest) < -FLOOR_DB
            c = librosa.feature.chroma_cqt(y=y, sr=ANALYSIS_RATE).mean(axis=1)
            self.chords[bar] = None if silent else c / np.linalg.norm(c)
        return self.chords[bar]

    def beat_distance(self, t1, t2):
        a, b = self.beat_at(t1), self.beat_at(t2)
        frames = min(a.shape[1], b.shape[1])
        return float(np.abs(a[:, :frames] - b[:, :frames]).mean())

    def sound(self, line, target):
        t, u = self.bars[line - 1], self.bars[target - 1]
        return [round(self.beat_distance(t - self.beat, u - self.beat), 1), round(self.beat_distance(t, u), 1)]

    def quiet(self, line):
        t = self.bars[line - 1]
        level = np.sqrt(np.mean(self.slice(t - self.beat, t) ** 2))
        return 20 * np.log10(level / self.rms + 1e-12) < -QUIET_DB

    def harmony(self, line, target):
        matches = []
        for k in CHORD_BARS:
            a, b = line + k, target + k
            if min(a, b) < 1 or max(a, b) >= len(self.bars):
                continue
            ca, cb = self.chord(a), self.chord(b)
            if ca is None and cb is None:
                continue
            matches.append(0.0 if ca is None or cb is None else float(ca @ cb))
        return min(matches, default=1.0)


def block_starts(sections):
    return sorted({s["from"] + k for s in sections for k in range(0, s["bars"], BLOCK_BARS)})


def song_jumps(song, sfx_dir):
    audio = Song(f"{sfx_dir}/{song['file']}", song["barTimes"])
    starts = block_starts(song["sections"])
    exits = sorted({b + BLOCK_BARS for b in starts})
    jumps = {}
    for e in exits:
        jumps[str(e)] = {str(b): [*audio.sound(e, b), round(audio.harmony(e, b), 3)] for b in starts if b != e}
    return jumps, [e for e in exits if audio.quiet(e)]


def main(songs_path, sfx_dir):
    path = Path(songs_path)
    songs = json.loads(path.read_text())
    for name, song in songs.items():
        song.pop("seams", None)
        song["jumps"], song["quietExits"] = song_jumps(song, sfx_dir)
        print(f"{name}: {sum(len(v) for v in song['jumps'].values())} jumps scored")
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(songs, indent=1) + "\n")
    os.replace(tmp, path)
    print(f"wrote {path}")


if __name__ == "__main__":
    main(*sys.argv[1:])
