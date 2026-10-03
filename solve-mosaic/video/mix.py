# The soundtrack: the ElevenLabs music bed plus one tap per stone landing (and
# a quieter one for its rebound), panned and attenuated by where the stone sits
# relative to the cinematic camera, with a level rider keeping dense passages
# a soft patter under the music.
#   python3 mix.py <outDir> [music.mp3] [name]  →  <outDir>/<name>.wav (default
#   sources/music.mp3 and mix), plus <outDir>/sfx_only.wav for the default mix
import json, sys
from pathlib import Path
import librosa, numpy as np, soundfile as sf

SR = 48000
DUR = 43.0
N = int(SR * DUR)
SOURCES = Path(__file__).parent / 'sources'
out = Path(sys.argv[1] if len(sys.argv) > 1 else 'out')
music_path = Path(sys.argv[2]) if len(sys.argv) > 2 else SOURCES / 'music.mp3'
name = sys.argv[3] if len(sys.argv) > 3 else 'mix'
rng = np.random.default_rng(7878)

ev = json.load(open(out / 'events.json'))
cam = np.array(json.load(open(out / 'campath.json')))  # t, x, y, z, r, az, polar, tx, tz
marble = [sf.read(out / f'tap_{k}.wav')[0] for k in range(1, 5)]
glass = [sf.read(out / f'glass_{k}.wav')[0] for k in range(1, 5)]
GLASS_TONES = {'turquoise', 'blue', 'blueDark', 'green', 'greenDark'}
SFX_GAIN = 0.9 * 0.5  # taps at half the level of the first cut, so they sit back from the music

def cam_at(t):
    i = np.clip(np.searchsorted(cam[:, 0], t), 1, len(cam) - 1)
    a, b = cam[i - 1], cam[i]
    f = 0 if b[0] == a[0] else np.clip((t - a[0]) / (b[0] - a[0]), 0, 1)
    c = a + (b - a) * f
    return c[1:4], np.array([c[7], 0.1, c[8]])

HALF_HFOV = np.arctan(np.tan(np.radians(15)) * 16 / 9)
L = np.zeros(N); R = np.zeros(N)

def place(t, clip, gain, pan, rate):
    if t < 0 or t >= DUR - 0.2:
        return
    src = np.arange(0, len(clip) - 1, rate)
    s = np.interp(src, np.arange(len(clip)), clip) * gain
    i0 = int(t * SR); i1 = min(N, i0 + len(s))
    s = s[: i1 - i0]
    th = (pan + 1) * np.pi / 4  # equal-power pan
    L[i0:i1] += s * np.cos(th); R[i0:i1] += s * np.sin(th)

for e in ev:
    p = np.array([e['x'], 0.15, -e['y']])
    for t, level in ((e['land'], 1.0), (e['rebound'], 0.2)):
        c, target = cam_at(t)
        d = np.linalg.norm(p - c)
        fwd = target - c; fwd /= np.linalg.norm(fwd)
        right = np.cross(fwd, [0, 1, 0]); right /= np.linalg.norm(right) + 1e-9
        v = (p - c) / (d + 1e-9)
        ang_side = np.arctan2(v @ right, v @ fwd)
        onscreen = abs(ang_side) < HALF_HFOV * 1.1 and v @ fwd > 0
        gain = (12.0 / max(d, 6.0)) * (1.0 if onscreen else 0.35)
        gain *= np.sqrt(max(e['size'], 0.2) / 0.8) * rng.uniform(0.8, 1.2) * level
        if e['group'] == 'dot': gain *= 1.4
        elif e['group'] == 'letter': gain *= 1.1
        pool = glass if e['tone'] in GLASS_TONES else marble
        clip = pool[rng.integers(len(pool))]
        rate = np.clip((0.6 / max(e['size'], 0.25)) ** 0.3, 0.82, 1.25) * rng.uniform(0.96, 1.04)
        place(t, clip, gain, float(np.clip(np.sin(ang_side) * 1.4, -0.9, 0.9)), rate)

sfx = np.stack([L, R], 1)

# keep dense passages a soft patter: a slow level rider on the effects bus
def rms(x, win):
    k = np.ones(win) / win
    return np.sqrt(np.convolve((x ** 2).mean(1), k, mode='same'))
level = rms(sfx, int(0.12 * SR))
ceiling = 0.05
g = np.minimum(1.0, ceiling / (level + 1e-9))
# smooth the gain (fast attack, slow release)
gs = np.empty_like(g); acc = 1.0
att, rel = np.exp(-1 / (0.01 * SR)), np.exp(-1 / (0.4 * SR))
for i in range(len(g)):
    acc = att * acc + (1 - att) * g[i] if g[i] < acc else rel * acc + (1 - rel) * g[i]
    gs[i] = acc
sfx *= gs[:, None]

music, _ = librosa.load(music_path, sr=SR, mono=False)
music = music.T[:N]
if len(music) < N:
    music = np.pad(music, ((0, N - len(music)), (0, 0)))
music *= 0.55
fade_in, fade_out = int(0.3 * SR), int(2.5 * SR)
music[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
music[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]

mix = music + sfx * SFX_GAIN
# bring the whole mix up to about -16 dBFS RMS, then limit gently to -1 dBFS
peak_target = 10 ** (-1 / 20)
lift = 10 ** ((-16 - 20 * np.log10(np.sqrt((mix ** 2).mean()) + 1e-12)) / 20)
mix *= lift; sfx *= lift; music *= lift
mix = np.tanh(mix / peak_target) * peak_target
sf.write(out / f'{name}.wav', mix, SR)
if name == 'mix':
    sf.write(out / 'sfx_only.wav', np.tanh(sfx * SFX_GAIN / peak_target) * peak_target, SR)

def db(x): return 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12)
print('music rms dB', round(db(music), 1), '| taps rms dB', round(db(sfx * SFX_GAIN), 1), '| mix peak', round(float(np.abs(mix).max()), 3))
