#!/usr/bin/env python3
"""Render the 45-second GravelKing Productions Featured Artist contest promo."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/videos/gka_main_stage_duet_30s_16x9.mp4"
LOGO = ROOT / "public/images/logo_banner.png"
VOICE = ROOT / "public/audio/featured-artist-contest-voiceover.mp3"
MUSIC = ROOT / "public/audio/featured-artist-contest-bed.mp3"
OUTPUT = ROOT / "public/videos/gravelking-featured-artist-contest-45s-16x9.mp4"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:")


def text(value: str, size: int, y: str, start: float, end: float, color: str = "white") -> str:
    return (
        f"drawtext=fontfile={FONT}:text='{esc(value)}':fontsize={size}:fontcolor={color}:"
        f"borderw=4:bordercolor=black@0.9:x=(w-tw)/2:y={y}:enable='between(t,{start},{end})'"
    )


filters = [
    "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,"
    "eq=brightness=-0.08:saturation=0.8:contrast=1.12,"
    "split=2[base][blur]",
    "[blur]gblur=sigma=24[blurred]",
    "[base][blurred]blend=all_expr='A*0.76+B*0.24',"
    "drawbox=x=0:y=0:w=iw:h=ih:color=0x05070b@0.40:t=fill,"
    "drawbox=x=0:y=0:w=iw:h=150:color=0x05070b@0.82:t=fill,"
    "drawbox=x=0:y=850:w=iw:h=230:color=0x05070b@0.86:t=fill,"
    "drawbox=x=120:y=835:w=1680:h=5:color=0xF2C14E@0.8:t=fill,"
    + text("GRAVELKING PRODUCTIONS", 34, "58", 0, 45, "0xF2C14E") + ","
    + text("YOUR ORIGINAL SONG DESERVES A REAL STAGE.", 68, "390", 0, 7.5) + ","
    + text("WRITE IT.  SING IT.  PRODUCE IT WITH GRAVELKING.", 40, "500", 0, 7.5, "0xF2C14E") + ","
    + text("STEP ONTO MAIN STAGE", 76, "390", 7.5, 15) + ","
    + text("Capture and submit your complete GK-produced performance.", 36, "505", 7.5, 15, "0xF2C14E") + ","
    + text("MASTERED.  IP-SEALED.  SERVER-RECORDED.", 62, "390", 15, 24) + ","
    + text("MLK V4 processing plus the GravelKing split-key provenance ledger.", 32, "500", 15, 24, "0xF2C14E") + ","
    + text("EXACTLY 10 FEATURED ARTISTS", 72, "390", 24, 33) + ","
    + text("Owner reviewed. Public Featured Artist page. Recognition and exposure.", 32, "500", 24, 33, "0xF2C14E") + ","
    + text("FUTURE LABEL + MOVIE-SYNC CONSIDERATION", 52, "380", 33, 40.5) + ","
    + text("Separate consent required. Selection and outside placement are not guaranteed.", 29, "495", 33, 40.5, "0xF2C14E") + ","
    + text("READY TO BE HEARD?", 76, "350", 40.5, 45) + ","
    + text("OPEN MAIN STAGE  /  GRAVELKINGPRO.COM", 40, "475", 40.5, 45, "0xF2C14E") + ","
    + text("FEATURED ARTIST CONTEST  /  10 SPOTS", 28, "945", 0, 45, "white") + ","
    "fade=t=in:st=0:d=0.4,fade=t=out:st=44.4:d=0.6,format=yuv420p[v]",
    "[1:a]atempo=1.125,atrim=0:44.8,asetpts=N/SR/TB,volume=1.0[voice]",
    "[2:a]atrim=0:45,asetpts=N/SR/TB,volume=0.16[music]",
    "[music][voice]amix=inputs=2:duration=longest:dropout_transition=0,"
    "afade=t=in:st=0:d=0.5,afade=t=out:st=44:d=1[a]",
]

subprocess.run(
    [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-stream_loop", "-1", "-i", str(SOURCE),
        "-i", str(VOICE),
        "-i", str(MUSIC),
        "-loop", "1", "-i", str(LOGO),
        "-filter_complex", ";".join(filters),
        "-map", "[v]", "-map", "[a]",
        "-t", "45",
        "-r", "30",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        str(OUTPUT),
    ],
    check=True,
)
print(OUTPUT)