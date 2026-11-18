#!/bin/sh
set -eu
# Ignore near-invisible alpha specks when fitting the camera to the toolbar square.
bounds=$(nice -n 10 magick docs/assets/logo-original.png -alpha extract -threshold 5% -format '%@' info:)
for size in 16 32 48 128; do
  nice -n 10 magick docs/assets/logo-original.png -crop "$bounds" +repage \
    -resize "${size}x${size}" -gravity center -background none -extent "${size}x${size}" \
    "public/icons/icon$size.png"
done
nice -n 10 magick docs/assets/logo-original.png -crop "$bounds" +repage \
  -resize 256x256 -gravity center -background none -extent 256x256 docs/assets/logo.png
