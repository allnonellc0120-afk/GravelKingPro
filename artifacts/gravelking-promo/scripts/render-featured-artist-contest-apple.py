#!/usr/bin/env python3
"""Render the Featured Artist contest promo for iPhone and iPad."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PHONE_STORY = ROOT.parent.parent / "attached_assets/gkpro_google_play_promo_1790201961313.mp4"
MAIN_STAGE = ROOT.parent.parent / "attached_assets/gravelkingpro_live_duet_stage_59s_16x9_1790201912561.mp4"
VOICE = ROOT / "public/audio/featured-artist-contest-voiceover.mp3"
MUSIC = ROOT / "public/audio/featured-artist-contest-bed.mp3"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def esc(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:")


def text(
    value: str,
    size: int,
    y: int,
    start: float,
    end: float,
    color: str = "white",
    border: str = "0x24113F",
    border_width: int = 9,
) -> str:
    """Bold outlined display lettering with an explicit time window."""
    return (
        f"drawtext=fontfile={FONT}:text='{esc(value)}':fontsize={size}:"
        f"fontcolor={color}:borderw={border_width}:bordercolor={border}:"
        f"shadowx=5:shadowy=7:shadowcolor=black@0.75:"
        f"x=(w-tw)/2:y={y}:enable='between(t,{start},{end})'"
    )


def label(value: str, size: int, y: int, start: float, end: float, color: str = "0xF7C948") -> str:
    return text(value, size, y, start, end, color=color, border="black", border_width=5)


def reframe(
    input_ref: str,
    start: float,
    end: float,
    width: int,
    height: int,
    name: str,
) -> list[str]:
    """Blurred-fill reframing preserves the complete source without hard crops."""
    duration = end - start
    return [
        f"[{input_ref}]trim=start={start}:end={end},setpts=PTS-STARTPTS,split=2[{name}bg0][{name}fg0]",
        f"[{name}bg0]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},gblur=sigma=42,eq=brightness=-0.18:saturation=0.78[{name}bg]",
        f"[{name}fg0]scale={width}:{height}:force_original_aspect_ratio=decrease[{name}fg]",
        f"[{name}bg][{name}fg]overlay=(W-w)/2:(H-h)/2:eof_action=repeat,"
        f"trim=duration={duration},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[{name}]",
    ]


def render(width: int, height: int, output: Path, sizes: dict[str, int]) -> None:
    # Story: app discovery (0–7), singer/creator in studio (7–14),
    # then the real Main Stage interface for the contest explanation.
    filters: list[str] = ["[0:v]split=2[phone_src][creator_src]"]
    filters += reframe("phone_src", 0, 7, width, height, "phone")
    filters += reframe("creator_src", 58, 65, width, height, "creator")
    filters += reframe("1:v", 0, 31, width, height, "stage")
    filters += ["[stage]tpad=stop_mode=clone:stop_duration=7[stage_long]"]
    filters += [
        "[phone][creator][stage_long]concat=n=3:v=1:a=0,"
        "eq=contrast=1.06:saturation=1.05,"
        f"drawbox=x=0:y=0:w=iw:h={int(height * 0.12)}:color=0x090510@0.82:t=fill,"
        f"drawbox=x=0:y={int(height * 0.86)}:w=iw:h={int(height * 0.14)}:color=0x090510@0.86:t=fill,"
        f"drawbox=x={int(width * 0.08)}:y={int(height * 0.135)}:"
        f"w={int(width * 0.84)}:h={int(height * 0.005)}:color=0xF7C948@0.95:t=fill,"
        + label("GRAVELKING PRODUCTIONS", sizes["brand"], int(height * 0.052), 0, 45) + ","
        + label("FEATURED ARTIST CONTEST", sizes["footer"], int(height * 0.92), 0, 45, "white") + ","
        + label("FIND YOUR SOUND", sizes["eyebrow"], int(height * 0.68), 0, 7) + ","
        + text("OPEN THE APP.", sizes["intro"], int(height * 0.735), 0, 7) + ","
        + label("WRITE IT.  SING IT.", sizes["eyebrow"], int(height * 0.68), 7, 14) + ","
        + text("MAKE IT YOURS.", sizes["intro"], int(height * 0.735), 7, 14) + ","
        # Each contest card has a separate title and subtitle lane.
        + f"drawbox=x={int(width * 0.055)}:y={int(height * 0.23)}:"
        f"w={int(width * 0.89)}:h={int(height * 0.45)}:"
        "color=0x090510@0.72:t=fill:enable='between(t,14,45)',"
        + f"drawbox=x={int(width * 0.055)}:y={int(height * 0.23)}:"
        f"w={int(width * 0.018)}:h={int(height * 0.45)}:"
        "color=0xF7C948@1.0:t=fill:enable='between(t,14,45)',"
        + label("01  /  ENTER", sizes["step"], int(height * 0.265), 14, 20) + ","
        + text("WRITE + SING", sizes["headline"], int(height * 0.355), 14, 20) + ","
        + text("YOUR ORIGINAL SONG", sizes["subhead"], int(height * 0.455), 14, 20, "0xF7C948") + ","
        + label("02  /  SUBMIT", sizes["step"], int(height * 0.265), 20, 26) + ","
        + text("STEP ONTO", sizes["headline"], int(height * 0.345), 20, 26) + ","
        + text("MAIN STAGE", sizes["headline"], int(height * 0.435), 20, 26, "0xF7C948") + ","
        + label("03  /  GET FEATURED", sizes["step"], int(height * 0.265), 26, 32) + ","
        + text("10 FEATURED", sizes["headline"], int(height * 0.345), 26, 32) + ","
        + text("ARTIST SPOTS", sizes["headline"], int(height * 0.435), 26, 32, "0xF7C948") + ","
        + label("04  /  BE DISCOVERED", sizes["step"], int(height * 0.265), 32, 38) + ","
        + text("LABEL + MOVIE-SYNC", sizes["subhead"], int(height * 0.355), 32, 38) + ","
        + text("CONSIDERATION", sizes["headline"], int(height * 0.435), 32, 38, "0xF7C948") + ","
        + label("OPPORTUNITY — NOT A PLACEMENT GUARANTEE", sizes["legal"], int(height * 0.575), 32, 38, "white") + ","
        + label("05  /  AUDITION NOW", sizes["step"], int(height * 0.265), 38, 45) + ","
        + text("OPEN MAIN STAGE", sizes["headline"], int(height * 0.355), 38, 45) + ","
        + text("GRAVELKINGPRO.COM", sizes["subhead"], int(height * 0.465), 38, 45, "0xF7C948") + ","
        + "fade=t=in:st=0:d=0.35,fade=t=out:st=44.4:d=0.6,format=yuv420p[v]",
        "[2:a]atempo=1.125,atrim=0:44.8,asetpts=N/SR/TB,volume=1.0[voice]",
        "[3:a]atrim=0:45,asetpts=N/SR/TB,volume=0.14[music]",
        "[music][voice]amix=inputs=2:duration=longest:dropout_transition=0,"
        "afade=t=in:st=0:d=0.35,afade=t=out:st=44:d=1[a]",
    ]

    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(PHONE_STORY), "-i", str(MAIN_STAGE),
            "-i", str(VOICE), "-i", str(MUSIC),
            "-filter_complex", ";".join(filters),
            "-map", "[v]", "-map", "[a]", "-t", "45", "-r", "30",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
            str(output),
        ],
        check=True,
    )
    print(output)


render(
    1080,
    1920,
    ROOT / "public/videos/gravelking-featured-artist-contest-45s-phone-9x16.mp4",
    {
        "brand": 30,
        "footer": 25,
        "eyebrow": 34,
        "intro": 56,
        "step": 27,
        "headline": 68,
        "subhead": 46,
        "legal": 19,
    },
)
render(
    1200,
    1600,
    ROOT / "public/videos/gravelking-featured-artist-contest-45s-ipad-3x4.mp4",
    {
        "brand": 31,
        "footer": 26,
        "eyebrow": 35,
        "intro": 58,
        "step": 28,
        "headline": 70,
        "subhead": 48,
        "legal": 20,
    },
)