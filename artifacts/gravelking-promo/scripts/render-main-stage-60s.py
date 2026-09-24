#!/usr/bin/env python3
"""Build a 60-second GravelKing Pro promo with a 30-second Main Stage hero.

The first 30 seconds are the existing clean Signal to Song promo. The second
30 seconds are rebuilt from three original Main Stage reference frames, using
the same still-artwork, zoompan, typography, and synthesized-audio method.
"""

from pathlib import Path
import math
import subprocess
import wave

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
VIDEOS = ROOT / "public/videos"
WORK = ROOT / ".render-main-stage-60s"
SOURCE = VIDEOS / "gka_main_stage_duet_30s_16x9.mp4"
LOGO = ROOT / "public/images/gk_hammer_logo.png"
EXISTING_PHONE = VIDEOS / "gravelkingpro_signal_to_song_30s_phone_9x16.mp4"
EXISTING_IPAD = VIDEOS / "gravelkingpro_signal_to_song_30s_ipad_3x4.mp4"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FPS = 30
HERO_SECONDS = 30
TOTAL_SECONDS = 60
SCENE_FRAMES = 10 * FPS

SCENES = [
    {
        "time": 8,
        "label": "MAIN STAGE / LIVE ROOM",
        "primary": "TWO SINGERS. ONE STAGE.",
        "secondary": "ZERO LATENCY.",
    },
    {
        "time": 16,
        "label": "SYNCED LYRIC ENGINE",
        "primary": "HEAR EACH OTHER",
        "secondary": "AT THE SAME TIME.",
    },
    {
        "time": 24,
        "label": "DUET QUEUE / LIVE MIXDOWN",
        "primary": "SING WITH A FRIEND",
        "secondary": "SAVE YOUR TAKE. SHARE THE MOMENT.",
    },
]


def extract_frames() -> list[Path]:
    WORK.mkdir(parents=True, exist_ok=True)
    frames = []
    for index, scene in enumerate(SCENES):
        target = WORK / f"stage-{index}.png"
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                str(scene["time"]),
                "-i",
                str(SOURCE),
                "-frames:v",
                "1",
                str(target),
            ],
            check=True,
        )
        frames.append(target)
    return frames


def make_audio(path: Path) -> None:
    """Create an original 30-second hero bed; the existing promo audio is untouched."""
    rate = 48_000
    frames = rate * HERO_SECONDS
    time = np.arange(frames, dtype=np.float64) / rate
    audio = np.zeros(frames, dtype=np.float64)
    rng = np.random.default_rng(20260922 + 21)

    chords = [
        (55.0, 82.41, 110.0),
        (61.74, 92.5, 123.47),
        (65.41, 98.0, 130.81),
    ]
    for number, chord in enumerate(chords):
        start = number * 10
        mask = (time >= start) & (time < start + 10)
        local = time[mask] - start
        fade = np.minimum(
            np.clip(local / 0.35, 0, 1),
            np.clip((10 - local) / 0.35, 0, 1),
        )
        pad = sum(np.sin(2 * math.pi * frequency * local) for frequency in chord)
        audio[mask] += 0.055 * pad * fade

    for beat in np.arange(0, HERO_SECONDS, 0.5):
        index = int(beat * rate)
        length = min(int(0.2 * rate), frames - index)
        local = np.arange(length) / rate
        frequency = 48 + 60 * np.exp(-local * 24)
        phase = 2 * math.pi * np.cumsum(frequency) / rate
        audio[index:index + length] += 0.36 * np.sin(phase) * np.exp(-local * 18)

    for hit in np.arange(0.5, HERO_SECONDS, 1.0):
        index = int(hit * rate)
        length = min(int(0.14 * rate), frames - index)
        local = np.arange(length) / rate
        audio[index:index + length] += (
            0.095 * rng.normal(0, 1, length) * np.exp(-local * 26)
        )

    for transition in (10, 20):
        index = int(transition * rate)
        length = min(int(0.8 * rate), frames - index)
        local = np.arange(length) / rate
        impact = np.sin(2 * math.pi * (75 - 35 * local) * local)
        audio[index:index + length] += 0.22 * impact * np.exp(-local * 5.5)

    audio *= np.where(time > 29.0, np.clip(30.0 - time, 0, 1), 1)
    audio = np.tanh(audio * 1.35)
    left = audio
    right = np.roll(audio, 31)
    right[:31] = 0
    pcm = np.int16(np.clip(np.stack([left, right], axis=1), -1, 1) * 32767)

    with wave.open(str(path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(pcm.tobytes())


def escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:")


def draw_text(value: str, size: int, y: str, color: str, border: int = 3) -> str:
    return (
        f"drawtext=fontfile={FONT_BOLD}:text='{escape(value)}':fontsize={size}:"
        f"fontcolor={color}:borderw={border}:bordercolor=black@0.9:"
        f"x=(w-tw)/2:y={y}"
    )


def frame_filter(
    index: int,
    frame: Path,
    width: int,
    height: int,
    scale: float,
) -> str:
    scene = SCENES[index]
    card_width = round(width * 0.92)
    card_height = round(card_width * 9 / 16)
    card_x = (width - card_width) // 2
    card_y = round(height * 0.13)
    title_size = round(64 * scale)
    secondary_size = round(38 * scale)
    label_size = round(24 * scale)
    base_y = round(height * 0.72)
    motion = (
        f"[{index}:v]scale={round(card_width * 1.08)}:{round(card_height * 1.08)}:"
        "force_original_aspect_ratio=increase,"
        f"crop={round(card_width * 1.08)}:{round(card_height * 1.08)},"
        f"zoompan=z='1+0.035*on/{SCENE_FRAMES - 1}':"
        f"x='(iw-iw/zoom)*{index % 2}*on/{SCENE_FRAMES - 1}':"
        f"y='(ih-ih/zoom)/2':d={SCENE_FRAMES}:s={width}x{height}:fps={FPS},"
        "eq=brightness=0.04:saturation=1.02:contrast=1.06"
    )
    graphics = [
        f"drawbox=x={card_x - 4}:y={card_y - 4}:w={card_width + 8}:h={card_height + 8}:color=0xF2C14E@0.9:t=4",
        f"drawbox=x=0:y=0:w=iw:h={round(height * 0.10)}:color=0x05070b@0.90:t=fill",
        f"drawbox=x=0:y={round(height * 0.68)}:w=iw:h={height - round(height * 0.68)}:color=0x05070b@0.91:t=fill",
        f"drawbox=x=(iw-{round(190 * scale)})/2:y={round(height * 0.70)}:w={round(190 * scale)}:h={round(5 * scale)}:color=0xF2C14E:t=fill",
        draw_text(scene["label"], label_size, str(round(height * 0.04)), "0xF2C14E"),
        f"drawbox=x={round(width * 0.08)}:y={round(height * 0.95)}:w={round(width * 0.84)}:h={round(4 * scale)}:color=0xF2C14E@0.35:t=fill",
        f"fade=t=in:st=0:d=0.28,fade=t=out:st={(SCENE_FRAMES / FPS) - 0.28}:d=0.28",
        "format=yuv420p,setsar=1",
    ]
    if index == 1:
        graphics.insert(5, draw_text(scene["primary"], title_size, str(base_y), "white"))
        graphics.insert(6, draw_text(scene["secondary"], secondary_size, str(round(height * 0.82)), "0xF2C14E"))
    motion = ",".join([motion, *graphics])

    # Scene three transitions from the punch to the benefit statement and CTA.
    if index == 2:
        motion += (
            f",drawtext=fontfile={FONT_BOLD}:text='SING WITH A FRIEND':fontsize={round(70 * scale)}:"
            "fontcolor=white:borderw=3:bordercolor=black@0.9:x=(w-tw)/2:"
            f"y={round(height * 0.72)}:enable='between(t,0,3.0)'"
            f",drawtext=fontfile={FONT_BOLD}:text='LIVE DUETS':fontsize={round(65 * scale)}:"
            "fontcolor=0xF2C14E:borderw=3:bordercolor=black@0.9:x=(w-tw)/2:"
            f"y={round(height * 0.72)}:enable='between(t,3.0,6.0)'"
            f",drawtext=fontfile={FONT_BOLD}:text='HEAR EACH OTHER AT THE SAME TIME':fontsize={round(32 * scale)}:"
            "fontcolor=white:borderw=2:bordercolor=black@0.9:x=(w-tw)/2:"
            f"y={round(height * 0.79)}:enable='between(t,3.0,6.0)'"
            f",drawtext=fontfile={FONT_BOLD}:text='SAVE YOUR TAKE  /  LISTEN BACK  /  SHARE WITH FRIENDS':fontsize={round(25 * scale)}:"
            "fontcolor=0xF2C14E:borderw=2:bordercolor=black@0.9:x=(w-tw)/2:"
            f"y={round(height * 0.84)}:enable='between(t,6.0,8.0)'"
            f",drawtext=fontfile={FONT_BOLD}:text='GRAVELKING PRO  /  gravelkingpro.com':fontsize={round(30 * scale)}:"
            "fontcolor=white:borderw=2:bordercolor=black@0.9:x=(w-tw)/2:"
            f"y={round(height * 0.77)}:enable='between(t,8.0,10.0)'"
            f",drawtext=fontfile={FONT_BOLD}:text='PLAY STORE  /  NOW LIVE':fontsize={round(27 * scale)}:"
            "fontcolor=0xF2C14E:borderw=2:bordercolor=black@0.9:x=(w-tw)/2:"
            f"y={round(height * 0.84)}:enable='between(t,8.0,10.0)'"
        )
    return motion + f"[scene{index}]"


def render_hero(output: Path, width: int, height: int, scale: float, frames: list[Path], audio: Path) -> None:
    command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    for frame in frames:
        command += ["-i", str(frame)]
    command += ["-i", str(audio)]
    filters = [
        frame_filter(index, frame, width, height, scale)
        for index, frame in enumerate(frames)
    ]
    filters.append("[scene0][scene1][scene2]concat=n=3:v=1:a=0,format=yuv420p[vout]")
    command += [
        "-filter_complex",
        ";".join(filters),
        "-map",
        "[vout]",
        "-map",
        "3:a",
        "-t",
        str(HERO_SECONDS),
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
        str(FPS),
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(output),
    ]
    subprocess.run(command, check=True)


def concat_full(output: Path, existing: Path, hero: Path) -> None:
    command = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(existing),
        "-i",
        str(hero),
        "-filter_complex",
        "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]",
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-t",
        str(TOTAL_SECONDS),
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
        str(FPS),
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(output),
    ]
    subprocess.run(command, check=True)


def main() -> None:
    VIDEOS.mkdir(parents=True, exist_ok=True)
    required = [SOURCE, EXISTING_PHONE, EXISTING_IPAD]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise SystemExit("Missing required video: " + ", ".join(missing))

    frames = extract_frames()
    audio = WORK / "main-stage-original.wav"
    make_audio(audio)
    hero_phone = WORK / "main-stage-hero-phone.mp4"
    hero_ipad = WORK / "main-stage-hero-ipad.mp4"
    render_hero(hero_phone, 1080, 1920, 1.0, frames, audio)
    render_hero(hero_ipad, 1620, 2160, 1.5, frames, audio)
    concat_full(
        VIDEOS / "gravelkingpro_signal_to_song_main_stage_60s_phone_9x16.mp4",
        EXISTING_PHONE,
        hero_phone,
    )
    concat_full(
        VIDEOS / "gravelkingpro_signal_to_song_main_stage_60s_ipad_3x4.mp4",
        EXISTING_IPAD,
        hero_ipad,
    )


if __name__ == "__main__":
    main()