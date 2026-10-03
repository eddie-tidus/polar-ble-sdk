#!/bin/bash
# Rebuilds the 1x cinematic MP4 (43 s, 1280x720, 24 fps) with its soundtrack.
# Needs dist/solve-mosaic.html (npm run build), Node with Playwright and
# Chromium, Python 3 with numpy, librosa and soundfile, and ffmpeg.
# Everything it writes goes to video/out/. Frame rendering is resumable: run
# it again after an interruption and it carries on from the frames on disk.
set -e
cd "$(dirname "$0")"
OUT=out
FPS=24
LAST=1031            # 43 s at 24 fps
JOBS=${JOBS:-2}      # renderers working on interleaved frames
mkdir -p $OUT/frames

node events.mjs $OUT
node campath.mjs $OUT
python3 taps.py $OUT
python3 mix.py $OUT

for ((j = 0; j < JOBS; j++)); do
  node render.mjs $OUT/frames $FPS $j $LAST $JOBS > $OUT/render_$j.log 2>&1 &
done
wait
n=$(ls $OUT/frames/f*.png | wc -l)
[ "$n" -eq $((LAST + 1)) ] || { echo "only $n of $((LAST + 1)) frames rendered; see $OUT/render_*.log"; exit 1; }

# Taps sit at exact landing times and frames sample every 1/24 s, so the audio
# is delayed half a frame (21 ms) to centre the sync error at about +-21 ms.
IN=(-framerate $FPS -i $OUT/frames/f%05d.png -i $OUT/mix.wav -map 0:v -map 1:a -af adelay=21:all=1)
FADE="fade=t=in:st=0:d=0.5,fade=t=out:st=42.0:d=1.0"
AUDIO=(-c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart)

# full quality, about 54 MiB
ffmpeg -v error -y "${IN[@]}" -vf $FADE -c:v libx264 -preset slow -tune film -crf 22 -pix_fmt yuv420p \
  "${AUDIO[@]}" $OUT/solve-mosaic-cinematic.mp4

# small copy for sharing, about 27 MiB: two-pass at 5.1 Mbit/s, with adaptive
# quantisation biased towards the dark stones
SMALL=(-vf $FADE -c:v libx264 -preset slower -tune film -pix_fmt yuv420p -b:v 5100k -maxrate 8000k -bufsize 10000k
  -x264-params aq-mode=3:aq-strength=0.9 -passlogfile $OUT/x264)
ffmpeg -v error -y -framerate $FPS -i $OUT/frames/f%05d.png "${SMALL[@]}" -pass 1 -an -f null /dev/null
ffmpeg -v error -y "${IN[@]}" "${SMALL[@]}" -pass 2 "${AUDIO[@]}" $OUT/solve-mosaic-cinematic-small.mp4
rm -f $OUT/x264*

ls -l $OUT/*.mp4
