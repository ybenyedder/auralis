#!/bin/bash
# Generates a small but rich sample library for Auralis testing:
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
  # A gentle evolving drone on a root + fifth + octave shimmer.
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

# Pentatonic-ish roots so each track sounds distinct
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

emit_album "Véronique Lune - Minuit Électrique (2022)" "Véronique Lune" "Minuit Électrique" "Electronic" 2022 \
  "Néon Liquide" "Circuits Dormants" "Autoroute Lunaire" "Dernier Métro"

emit_album "Ombre Solaire - Cendres et Or (2021)" "Ombre Solaire" "Cendres et Or" "Ambient" 2021 \
  "Poussière Dorée" "Marée Basse" "Lueurs"

emit_album "Kaïro Beats - Rues de Lumière (2023)" "Kaïro Beats" "Rues de Lumière" "Hip-Hop" 2023 \
  "Bitume Chaud" "Graffiti Sonore" "Toits de Béton" "Nuit Blanche"

emit_album "Élise Marchand - Fragments (2020)" "Élise Marchand" "Fragments" "Classical" 2020 \
  "Prélude Gris" "Nocturne Brisé" "Étude Sombre"

emit_album "Nova Drift - Horizon Rouge (2022)" "Nova Drift" "Horizon Rouge" "Rock" 2022 \
  "Comète" "Silex" "Ligne de Fuite" "Cendre Vive"

emit_album "Djémila & The Rhythms - Afro Diaspora (2019)" "Djémila & The Rhythms" "Afro Diaspora" "Afrobeat" 2019 \
  "Tam-Tam Digital" "Savane Urbaine" "Baobab Électrique"

emit_album "Quartet Bleu - Jazz de Minuit (2018)" "Quartet Bleu" "Jazz de Minuit" "Jazz" 2018 \
  "Blue Note" "Swing Nocturne" "Contrebasse"

emit_album "Sub Terra - Basse Altitude (2023)" "Sub Terra" "Basse Altitude" "Techno" 2023 \
  "Strate 1" "Faille" "Tunnel"

# LRC sidecars for two tracks (tests the lyrics pipeline offline)
cat > "$MUSIC/Véronique Lune - Minuit Électrique (2022)/01 - Néon Liquide.lrc" <<'EOF'
[ti:Néon Liquide]
[ar:Véronique Lune]
[al:Minuit Électrique]
[00:00.00]Néon liquide sur la ville endormie
[00:06.50]Les rues scintillent d'une lueur infinie
[00:13.20]Je marche seule dans ce décor électrique
[00:19.80]Chaque pas réveille la nuit magnétique
[00:26.40]Néon, néon, liquide dans mes veines
[00:33.00]La ville pulse et la lumière m'entraîne
EOF

cat > "$MUSIC/Quartet Bleu - Jazz de Minuit (2018)/01 - Blue Note.lrc" <<'EOF'
[ti:Blue Note]
[ar:Quartet Bleu]
[al:Jazz de Minuit]
[00:00.00]Minuit sonne, le club s'éteint presque
[00:07.10]Une note bleue flotte dans l'air
[00:14.30]Le contrebassiste ferme les yeux
[00:21.50]Et le piano raconte nos adieux
EOF

echo "--- Generated library ---"
find "$MUSIC" -name "*.mp3" | wc -l
find "$MUSIC" -name "*.mp3" | head -5
du -sh "$MUSIC"
