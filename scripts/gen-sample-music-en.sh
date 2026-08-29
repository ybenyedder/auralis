#!/bin/bash
# English sample library for Auralis store screenshots & demos:
# 8 albums / 8 artists / 8 genres, embedded cover art, ID3 tags, LRC sidecars.
set -u
MUSIC="/home/z/my-project/music"
mkdir -p "$MUSIC"

gen_cover() { # $1=file $2=c0 $3=c1 $4=label
  ffmpeg -y -loglevel error -f lavfi -i "gradients=s=512x512:c0=$2:c1=$3:n=2" \
    -vf "drawtext=text='$4':fontsize=54:fontcolor=white@0.92:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.25:boxborderw=18" \
    -frames:v 1 "$1"
}

gen_track() { # $1=outfile $2=cover $3=title $4=artist $5=album $6=albumartist $7=genre $8=year $9=track $10=total $11=freq $12=dur
  local out="$1" cover="$2" title="$3" artist="$4" album="$5" aa="$6" genre="$7" year="$8" tn="$9" tot="${10}" f="${11}" d="${12}"
  local expr="(0.55+0.35*sin(2*PI*0.11*t))*(0.32*sin(2*PI*${f}*t)+0.22*sin(2*PI*${f}*1.5*t)+0.12*sin(2*PI*${f}*2*t+0.7*sin(2*PI*0.23*t)))"
  ffmpeg -y -loglevel error \
    -f lavfi -i "aevalsrc=${expr}:s=44100:d=${d}" \
    -i "$cover" \
    -map 0:a -map 1:v \
    -c:a libmp3lame -b:a 96k -ar 44100 -ac 2 \
    -c:v mjpeg -q:v 4 -disposition:v attached_pic \
    -id3v2_version 3 -write_id3v1 1 \
    -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)" \
    -metadata title="$title" -metadata artist="$artist" -metadata album="$album" \
    -metadata album_artist="$aa" -metadata genre="$genre" -metadata date="$year" \
    -metadata track="$tn/$tot" -metadata disc="1/1" \
    "$out"
}

freqs=(220 246.94 261.63 293.66 329.63 349.23 392 440 493.88 523.25)

emit_album() { # dir artist album genre year tracks...
  local dir="$1" artist="$2" album="$3" genre="$4" year="$5"; shift 5
  local titles=("$@")
  mkdir -p "$MUSIC/$dir"
  local cover="$MUSIC/$dir/cover.jpg"
  local c0="${COVERS[$ALB_IDX*2]}" c1="${COVERS[$((ALB_IDX*2+1))]}"
  gen_cover "$cover" "$c0" "$c1" "${album:0:12}"
  local i=1
  for t in "${titles[@]}"; do
    local f=${freqs[$(( (i + ALB_IDX*3) % ${#freqs[@]} ))]}
    local d=$(( 45 + (i * 7 + ALB_IDX * 11) % 30 ))
    local num; num=$(printf "%02d" $i)
    gen_track "$MUSIC/$dir/${num} - ${t}.mp3" "$cover" "$t" "$artist" "$album" "$artist" "$genre" "$year" "$i" "${#titles[@]}" "$f" "$d"
    i=$((i+1))
  done
  ALB_IDX=$((ALB_IDX+1))
}

COVERS=("0x1a1a2e" "0xe94560" "0x0f3460" "0x16bd5a" "0x2d132c" "0xee964b" "0x101d2e" "0xfa7dfb" "0x0b3910" "0x41ead4" "0x3d0000" "0xffba08" "0x14213d" "0xfca311" "0x2b2d42" "0xef476f")
ALB_IDX=0

emit_album "Veronica Moon - Electric Midnight (2022)" "Veronica Moon" "Electric Midnight" "Electronic" 2022 \
  "Liquid Neon" "Sleeping Circuits" "Moonlit Highway" "Last Train"

emit_album "Solar Shade - Ashes and Gold (2021)" "Solar Shade" "Ashes and Gold" "Ambient" 2021 \
  "Golden Dust" "Low Tide" "Glow"

emit_album "Kairo Beats - Streets of Light (2023)" "Kairo Beats" "Streets of Light" "Hip-Hop" 2023 \
  "Hot Asphalt" "Sound Graffiti" "Concrete Rooftops" "Sleepless Night"

emit_album "Elise Marsh - Fragments (2020)" "Elise Marsh" "Fragments" "Classical" 2020 \
  "Grey Prelude" "Broken Nocturne" "Dark Study"

emit_album "Nova Drift - Red Horizon (2022)" "Nova Drift" "Red Horizon" "Rock" 2022 \
  "Comet" "Flint" "Escape Line" "Live Ember"

emit_album "Jamila & The Rhythms - Afro Diaspora (2019)" "Jamila & The Rhythms" "Afro Diaspora" "Afrobeat" 2019 \
  "Digital Tam-Tam" "Urban Savanna" "Electric Baobab"

emit_album "Blue Quartet - Midnight Jazz (2018)" "Blue Quartet" "Midnight Jazz" "Jazz" 2018 \
  "Blue Note" "Nocturne Swing" "Upright Bass"

emit_album "Sub Terra - Low Altitude (2023)" "Sub Terra" "Low Altitude" "Techno" 2023 \
  "Layer One" "Fault Line" "Tunnel"

# LRC sidecars for two tracks (tests the lyrics pipeline offline)
cat > "$MUSIC/Veronica Moon - Electric Midnight (2022)/01 - Liquid Neon.lrc" <<'EOF'
[ti:Liquid Neon]
[ar:Veronica Moon]
[al:Electric Midnight]
[00:00.00]Liquid neon on the sleeping city
[00:06.50]Streets are glowing with an endless light
[00:13.20]I walk alone through this electric scene
[00:19.80]Every step awakens the magnetic night
[00:26.40]Neon, neon, liquid in my veins
[00:33.00]The city pulses and the light pulls me in
EOF

cat > "$MUSIC/Blue Quartet - Midnight Jazz (2018)/01 - Blue Note.lrc" <<'EOF'
[ti:Blue Note]
[ar:Blue Quartet]
[al:Midnight Jazz]
[00:00.00]Midnight strikes, the club is going dim
[00:07.10]A blue note floating in the air
[00:14.30]The bass player closes his eyes
[00:21.50]And the piano tells our goodbyes
EOF

echo "--- Generated library ---"
find "$MUSIC" -name "*.mp3" | wc -l
find "$MUSIC" -name "*.mp3" | head -5
du -sh "$MUSIC"
