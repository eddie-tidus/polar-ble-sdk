# Prepares the ElevenLabs tap recordings for the mix.
#   python3 taps.py <outDir>  →  <outDir>/sand_N.wav, <outDir>/glass_N.wav
# Stone taps (sand_N) are made dull and smooth: low-passed, with the strike
# rounded off, plus a faint layer of soft grit so dense passages blend into a
# sandy patter. Glass taps (turquoise stones only) keep their bright tick.
import sys
from pathlib import Path
import librosa, numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt

SR = 48000
SOURCES = Path(__file__).parent / 'sources'
SAND = ['sand_1', 'sand_2', 'sand_3', 'sand_4']
GLASS = ['glass_1', 'glass_2', 'glass_4']  # glass_3 is mostly high hiss, left out
out = Path(sys.argv[1] if len(sys.argv) > 1 else 'out')
out.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7878)

def trim(y):
    """The strike and its decay, with 2 ms of pre-roll and a short tail fade."""
    win = int(0.004 * SR)
    sm = np.convolve(np.abs(y), np.ones(win) / win, mode='same')
    peak_i = int(sm.argmax()); peak = sm[peak_i]
    on = np.where(sm[:peak_i] < peak * 0.08)[0]
    start = int(on[-1]) if len(on) else 0
    after = np.where(sm[peak_i:] < peak * 0.01)[0]
    end = peak_i + int(after[0]) if len(after) else len(y)
    a, b = max(0, start - int(0.002 * SR)), min(len(y), end + int(0.03 * SR))
    clip = y[a:b].copy()
    fade = min(len(clip) // 3, int(0.03 * SR))
    clip[-fade:] *= np.linspace(1, 0, fade)
    return clip

def soften(clip):
    # dull: gentle low-pass at 1.8 kHz
    clip = sosfilt(butter(2, 1800, 'low', fs=SR, output='sos'), clip)
    # smooth: round the strike over its first 8 ms
    n = int(0.008 * SR)
    clip[:n] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n))
    # sandy: sparse grains of filtered noise under a soft swell and decay,
    # about 14 dB below the thud
    t = np.arange(len(clip)) / SR
    grains = rng.standard_normal(len(clip)) * (rng.random(len(clip)) < 0.06)
    grit = sosfilt(butter(2, [1200, 4500], 'band', fs=SR, output='sos'), grains)
    grit *= (1 - np.exp(-t / 0.006)) * np.exp(-t / 0.035)
    grit *= 10 ** (-14 / 20) * np.sqrt((clip ** 2).mean() / ((grit ** 2).mean() + 1e-12))
    return clip + grit

for name in SAND + GLASS:
    y, _ = librosa.load(SOURCES / f'{name}.mp3', sr=SR, mono=True)
    clip = trim(y)
    if name in SAND:
        clip = soften(clip)
    clip /= np.abs(clip).max() + 1e-9
    sf.write(out / f'{name}.wav', clip, SR)
    print(f'{name}: {len(clip) / SR * 1000:.0f} ms')
