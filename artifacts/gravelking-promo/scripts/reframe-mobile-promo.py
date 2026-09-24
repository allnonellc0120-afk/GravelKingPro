#!/usr/bin/env python3
"""Build full-view phone and iPad edits from the finished landscape promo.

The portrait versions are genuine recompositions, not center crops. The stage
and mastering views keep their original aspect ratios inside portrait layouts
based on the supplied full-screen GravelKing Pro references.
"""

from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parents[1]
SOURCE = ROOT / "public/videos/gravelkingpro_live_duet_stage_59s_16x9.mp4"
STAGE_REFERENCE = WORKSPACE / "attached_assets/IMG_3638_1790076111984.jpeg"
MASTER_REFERENCE = WORKSPACE / "attached_assets/IMG_3641_1790076111984.jpeg"
HOME_REFERENCE = WORKSPACE / "attached_assets/IMG_3639_1790076111984.jpeg"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def esc_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def text(
    value: str,
    size: int,
    y: int,
    start: float,
    end: float,
    color: str = "white",
) -> str:
    return (
        f"drawtext=fontfile={FONT}:text='{esc_text(value)}':"
        f"fontsize={size}:fontcolor={color}:"
        "borderw=3:bordercolor=black@0.92:"
        f"x=(w-tw)/2:y={y}:enable='between(t,{start},{end})'"
    )


def cover_background(index: int, width: int, height: int, duration: int) -> str:
    return (
        f"[{index}:v]trim=duration={duration},setpts=PTS-STARTPTS,"
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},gblur=sigma=18,"
        "eq=brightness=-0.30:saturation=0.62[bg"
    )


def build_filter(width: int, height: int, scale: float) -> str:
    margin = round(40 * scale)

    stage_card_width = width - (margin * 2)
    stage_card_height = round(stage_card_width * 1080 / 1200)
    stage_y = round(220 * scale) if height / width > 1.5 else round(120 * scale)
    stage_copy_y = min(stage_y + stage_card_height + round(82 * scale), height - round(360 * scale))

    master_card_width = width - (round(80 * scale) * 2)
    master_card_height = round(master_card_width * 1000 / 840)
    master_y = round(225 * scale) if height / width > 1.5 else round(110 * scale)
    if master_y + master_card_height > height - round(210 * scale):
        master_card_height = height - master_y - round(210 * scale)
        master_card_width = round(master_card_height * 840 / 1000)
    master_copy_y = min(master_y + master_card_height + round(60 * scale), height - round(120 * scale))

    title_size = round(60 * scale)
    subtitle_size = round(31 * scale)
    hook_size = round(40 * scale)
    nav_size = round(23 * scale)
    cta_size = round(76 * scale)

    # Stage reference background.
    stage_bg = (
        f"[1:v]trim=duration=25,setpts=PTS-STARTPTS,"
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},gblur=sigma=18,"
        "eq=brightness=-0.30:saturation=0.62[stagebg]"
    )

    # The useful stage occupies the left 1200 px of the landscape recording.
    # Keep the 1200x1080 aspect ratio and remove only the landscape-only copy.
    stage_fg = (
        "[0:v]trim=start=0:end=25,setpts=PTS-STARTPTS,"
        "crop=1200:1080:0:0,"
        "drawbox=x=0:y=365:w=1200:h=185:color=0x080910@0.98:"
        "t=fill:enable='between(t,1.2,8.5)',"
        "drawbox=x=0:y=875:w=1200:h=110:color=0x080910@0.96:"
        "t=fill:enable='between(t,8.5,15.0)',"
        "drawbox=x=0:y=710:w=1200:h=150:color=0x080910@0.92:"
        "t=fill:enable='between(t,15.0,24.9)',"
        f"scale={stage_card_width}:{stage_card_height}:flags=lanczos,"
        f"pad={stage_card_width + 8}:{stage_card_height + 8}:4:4:"
        "color=0x5a4920[stagecard]"
    )

    stage_overlay = (
        f"[stagebg][stagecard]overlay=x=(W-w)/2:y={stage_y}:"
        "shortest=1[stagebase]"
    )

    stage_titles = ",".join(
        [
            "drawbox=x=0:y=0:w=iw:h="
            f"{round(170 * scale)}:color=0x080910@0.92:t=fill",
            text("LIVE DUET STAGE", title_size, round(54 * scale), 0, 25, "0xF5C542"),
            text(
                "REAL SINGERS  /  LIVE SYNC",
                subtitle_size,
                round(116 * scale),
                0,
                25,
            ),
            text(
                "CAN YOUR STAGE DO THIS LIVE?",
                hook_size,
                stage_copy_y,
                1.2,
                8.5,
                "0xF5C542",
            ),
            text(
                "ROLLING LYRICS  /  ZERO LATENCY",
                subtitle_size,
                stage_copy_y,
                9,
                15,
            ),
            text(
                "2 SINGERS  /  1 LIVE STAGE",
                subtitle_size,
                stage_copy_y,
                16,
                25,
                "0xB794F4",
            ),
            "drawbox=x="
            f"{margin}:y=ih-{round(160 * scale)}:w=iw-{margin * 2}:"
            f"h={round(112 * scale)}:color=0x11111c@0.90:"
            f"t=fill",
            text(
                "STUDIO     MAIN STAGE     JAX     VAULT     ARTIST",
                nav_size,
                height - round(124 * scale),
                0,
                25,
                "0xD7C68A",
            ),
        ]
    )

    # Mastering reference background and the complete live mastering panel.
    master_bg = (
        f"[2:v]trim=duration=22,setpts=PTS-STARTPTS,"
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},gblur=sigma=14,"
        "eq=brightness=-0.24:saturation=0.72[masterbg]"
    )
    master_fg = (
        "[0:v]trim=start=25:end=47,setpts=PTS-STARTPTS,"
        "crop=840:1000:1080:40,"
        "drawbox=x=0:y=690:w=60:h=310:color=0x080910@1.0:t=fill,"
        f"scale={master_card_width}:{master_card_height}:flags=lanczos,"
        f"pad={master_card_width + 8}:{master_card_height + 8}:4:4:"
        "color=0xF5C542[mastercard]"
    )
    master_overlay = (
        f"[masterbg][mastercard]overlay=x=(W-w)/2:y={master_y}:"
        "shortest=1[masterbase]"
    )
    master_titles = ",".join(
        [
            "drawbox=x=0:y=0:w=iw:h="
            f"{round(165 * scale)}:color=0x080910@0.94:t=fill",
            text(
                "REAL STUDIO MASTER",
                round(48 * scale),
                round(58 * scale),
                0,
                22,
            ),
            text(
                "RAW TAKE  ->  MASTERED",
                subtitle_size,
                master_copy_y,
                4.8,
                22,
                "0xF5C542",
            ),
        ]
    )

    # Full-view workspace end card.
    cta_bg = (
        f"[3:v]trim=duration=12,setpts=PTS-STARTPTS,"
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},gblur=sigma=7,"
        "eq=brightness=-0.40:saturation=0.70,"
        "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.86:t=fill[ctabase]"
    )
    cta_titles = ",".join(
        [
            text(
                "GRAVELKING PRO",
                cta_size,
                round(height * 0.31),
                0,
                12,
                "0xF5C542",
            ),
            text(
                "THE WHOLE STUDIO IN ONE VIEW",
                subtitle_size,
                round(height * 0.43),
                0.5,
                12,
            ),
            text(
                "LIVE STAGE  /  JAX  /  MASTERING",
                subtitle_size,
                round(height * 0.50),
                1.0,
                12,
            ),
            text(
                "SING IT LIVE",
                round(58 * scale),
                round(height * 0.66),
                3.5,
                12,
            ),
            text(
                "gravelkingpro.com",
                round(52 * scale),
                round(height * 0.73),
                3.5,
                12,
                "0xF5C542",
            ),
            text(
                "FREE TO START  /  NO INSTALL",
                round(30 * scale),
                round(height * 0.82),
                5.0,
                12,
            ),
        ]
    )

    return ";".join(
        [
            stage_bg,
            stage_fg,
            stage_overlay,
            f"[stagebase]{stage_titles}[stage]",
            master_bg,
            master_fg,
            master_overlay,
            f"[masterbase]{master_titles}[master]",
            cta_bg,
            f"[ctabase]{cta_titles}[cta]",
            "[stage][master][cta]concat=n=3:v=1:a=0,format=yuv420p[vout]",
        ]
    )


def render(output: Path, width: int, height: int, scale: float) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".fullview.tmp.mp4")
    temporary.unlink(missing_ok=True)

    command = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(SOURCE),
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        str(STAGE_REFERENCE),
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        str(MASTER_REFERENCE),
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        str(HOME_REFERENCE),
        "-filter_complex",
        build_filter(width, height, scale),
        "-map",
        "[vout]",
        "-map",
        "0:a",
        "-t",
        "59",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-profile:v",
        "high",
        "-level",
        "4.2",
        "-r",
        "30",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        str(temporary),
    ]
    subprocess.run(command, check=True)
    temporary.replace(output)


def main() -> None:
    required = [SOURCE, STAGE_REFERENCE, MASTER_REFERENCE, HOME_REFERENCE]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise SystemExit("Missing required file(s): " + ", ".join(missing))

    render(
        ROOT / "public/videos/gravelkingpro_live_duet_stage_59s_phone_9x16.mp4",
        width=1080,
        height=1920,
        scale=1,
    )
    render(
        ROOT / "public/videos/gravelkingpro_live_duet_stage_59s_ipad_3x4.mp4",
        width=1620,
        height=2160,
        scale=1.5,
    )


if __name__ == "__main__":
    main()