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


class Beats:
    def __init__(self, path, bars):
        self.audio, _ = librosa.load(path, sr=ANALYSIS_RATE, mono=True)
        self.bars = bars
        self.beat = (bars[1] - bars[0]) / BEATS_PER_BAR
        self.loudest = self.mel_power(self.audio).mean(axis=1).max()
        self.cache = {}

    def mel_power(self, y):
        return librosa.feature.melspectrogram(y=y, sr=ANALYSIS_RATE, n_mels=MELS, n_fft=FFT, hop_length=HOP, center=False)

    def at(self, t):
        key = round(t, 4)
        if key not in self.cache:
            y = self.audio[int(t * ANALYSIS_RATE):int((t + self.beat) * ANALYSIS_RATE)]
            db = librosa.power_to_db(self.mel_power(y), ref=self.loudest, top_db=None)
            self.cache[key] = np.maximum(db, -FLOOR_DB)
        return self.cache[key]

    def distance(self, t1, t2):
        a, b = self.at(t1), self.at(t2)
        frames = min(a.shape[1], b.shape[1])
        return float(np.abs(a[:, :frames] - b[:, :frames]).mean())

    def seam(self, exit_bar, target_bar):
        line = self.bars[exit_bar - 1]
        target = self.bars[target_bar - 1]
        before = self.distance(line - self.beat, target - self.beat)
        after = self.distance(line, target)
        return round(min(before, after), 1)


def exit_bars(sections):
    return sorted({bar for s in sections for bar in range(s["from"] + 1, s["from"] + s["bars"] + 1)})


def song_seams(song, sfx_dir):
    beats = Beats(f"{sfx_dir}/{song['file']}", song["barTimes"])
    starts = [s["from"] for s in song["sections"]]
    return {str(e): {str(t): beats.seam(e, t) for t in starts if t != e} for e in exit_bars(song["sections"])}


def main(songs_path, sfx_dir):
    path = Path(songs_path)
    songs = json.loads(path.read_text())
    for name, song in songs.items():
        song["seams"] = song_seams(song, sfx_dir)
        print(f"{name}: {sum(len(v) for v in song['seams'].values())} seams")
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(songs, indent=1) + "\n")
    os.replace(tmp, path)
    print(f"wrote {path}")


if __name__ == "__main__":
    main(*sys.argv[1:])
