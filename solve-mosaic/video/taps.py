# Cuts each ElevenLabs tap down to the strike and its decay, normalised.
#   python3 taps.py <outDir>  →  <outDir>/tap_N.wav, <outDir>/glass_N.wav
import sys
from pathlib import Path
import librosa, numpy as np, soundfile as sf

SR = 48000
SOURCES = Path(__file__).parent / 'sources'
out = Path(sys.argv[1] if len(sys.argv) > 1 else 'out')
out.mkdir(parents=True, exist_ok=True)

for name in [f'tap_{k}' for k in range(1, 5)] + [f'glass_{k}' for k in range(1, 5)]:
    y, _ = librosa.load(SOURCES / f'{name}.mp3', sr=SR, mono=True)
    win = int(0.004 * SR)
    sm = np.convolve(np.abs(y), np.ones(win) / win, mode='same')
    peak_i = int(sm.argmax()); peak = sm[peak_i]
    on = np.where(sm[:peak_i] < peak * 0.08)[0]
    start = int(on[-1]) if len(on) else 0
    after = np.where(sm[peak_i:] < peak * 0.01)[0]
    end = peak_i + int(after[0]) if len(after) else len(y)
    print(f'{name}: strike at {start / SR * 1000:.0f} ms, decays to -40 dB by {end / SR * 1000:.0f} ms')
    # keep 2 ms of pre-roll and the decay, with a short fade at the tail
    a, b = max(0, start - int(0.002 * SR)), min(len(y), end + int(0.03 * SR))
    clip = y[a:b].copy()
    fade = min(len(clip) // 3, int(0.03 * SR))
    clip[-fade:] *= np.linspace(1, 0, fade)
    clip /= np.abs(clip).max() + 1e-9
    sf.write(out / f'{name}.wav', clip, SR)
