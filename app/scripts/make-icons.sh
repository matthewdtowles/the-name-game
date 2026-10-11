#!/usr/bin/env bash
# Draws the app icon, Android adaptive icon layers, splash image, and favicon
# into app/assets: a paper slip with a question mark, tilted on the night table.
# Needs ImageMagick. Run from anywhere; rerun after changing the colors.
set -euo pipefail
cd "$(dirname "$0")/.."

table="#211C36"
paper="#FFF4D6"
ink="#1E1A2E"
font="../node_modules/@expo-google-fonts/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf"
out=assets
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$out"

# slip <width> <fill> <mark>: a tilted slip on a transparent square, the
# question mark knocked out when <mark> is "none".
slip() {
  local w=$1 fill=$2 mark=$3 h=$(($1 * 7 / 10)) r=$(($1 / 22))
  convert -size "${w}x${h}" xc:none -fill "$fill" \
    -draw "roundrectangle 0,0 $((w - 1)),$((h - 1)) $r,$r" "$work/slip.png"
  if [ "$mark" = none ]; then
    convert -size "${w}x${h}" xc:none -font "$font" -pointsize $((h * 9 / 10)) \
      -fill black -gravity center -annotate +0+$((h / 40)) "?" "$work/mark.png"
    convert "$work/slip.png" "$work/mark.png" -compose DstOut -composite "$work/slip.png"
  else
    convert "$work/slip.png" -font "$font" -pointsize $((h * 9 / 10)) \
      -fill "$mark" -gravity center -annotate +0+$((h / 40)) "?" "$work/slip.png"
  fi
  convert "$work/slip.png" -background none -rotate -6 "$work/tilted.png"
}

# iOS and the store listing: full bleed, no transparency.
slip 640 "$paper" "$ink"
convert -size 1024x1024 "xc:$table" "$work/tilted.png" -gravity center \
  -composite -alpha off "$out/icon.png"

# Android adaptive icon: the launcher masks the outer third, so keep the slip
# inside the middle 66%. The background is a plain color in app.json.
slip 560 "$paper" "$ink"
convert -size 1024x1024 xc:none "$work/tilted.png" -gravity center \
  -composite "$out/android-icon-foreground.png"
slip 560 white none
convert -size 1024x1024 xc:none "$work/tilted.png" -gravity center \
  -composite "$out/android-icon-monochrome.png"

# Splash: the slip alone, centered on the table color by expo-splash-screen.
slip 900 "$paper" "$ink"
convert -size 1024x1024 xc:none "$work/tilted.png" -gravity center \
  -composite "$out/splash-icon.png"

# Favicon for the web build.
convert "$out/icon.png" -resize 48x48 "$out/favicon.png"
