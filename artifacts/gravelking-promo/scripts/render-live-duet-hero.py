#!/usr/bin/env python3
"""Render a clean live-duet hero promo.

The hero is the live-stage/partner reference supplied for this request. The
old promo videos and their timing/audio are not inputs. Six motion variations
of the same feature card occupy 29 seconds; the last second is a lockup.
"""

from pathlib import Path
import math
import subprocess
import wave

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parents[1]
VIDEOS = ROOT / "public/videos"
WORK = ROOT / ".render-live-duet"
HERO = WORKSPACE / "attached_assets/IMG_3634_1790055780708.png"
LOGO = ROOT / "public/images/gk_hammer_logo.png"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FPS = 30
TOTAL_SECONDS = 30
HERO_SECONDS = 29
HERO_FRAMES = round(HERO_SECONDS / 6 * FPS)

MESSAGES = [
    ("LIVE DUET STAGE", "REAL SINGERS. ONE BEAT.", "GRAVELKING PRO / LIVE"),
    ("HEAR EACH OTHER", "IN REAL TIME", "DUET MONITOR"),
    ("NO LAG", "JUST THE PERFORMANCE", "SYNCED LIVE"),
    ("POWERED BY", "GK ADVANTAGE ENGINE", "REAL-TIME AUDIO"),
    ("SING TOGETHER", "FROM ANYWHERE", "LIVE STAGE"),
    ("THE STAGE IS LIVE", "JOIN THE PERFORMANCE", "GRAVELKING PRO"),
]


def make_audio(path: Path) -> None:
    """Create a fresh 30-second call-and-response electronic bed."""
    rate = 48_000
    frames = rate * TOTAL_SECONDS
    time = np.arange(frames, dtype=np.float64) / rate
    audio = np.zeros(frames, dtype=np.float64)
    rng = np.random.default_rng(20260922 + 7)

    # Six rising chord phrases reinforce the six live-stage messages.
    chords = [
        (55.0, 82.41, 110.0),
        (61.74, 92.5, 123.47),
        (65.41, 98.0, 130.81),
        (73.42, 110.0, 146.83),
        (82.41, 123.47, 164.81),
        (98.0, 146.83, 196.0),
    ]
    segment = HERO_SECONDS / 6
    for number, chord in enumerate(chords):
        start = number * segment
        end = min(HERO_SECONDS, (number + 1) * segment)
        mask = (time >= start) & (time < end)
        local = time[mask] - start
        fade = np.minimum(np.clip(local / 0.22, 0, 1), np.clip((segment - local) / 0.22, 0, 1))
        phrase = sum(np.sin(2 * math.pi * note * local) for note in chord)
        audio[mask] += 0.05 * phrase * fade

    # A steady 120 BPM pocket, plus alternating left/right accents.
    for beat in np.arange(0, HERO_SECONDS, 0.5):
        index = int(beat * rate)
        length = min(int(0.2 * rate), frames - index)
        local = np.arange(length) / rate
        frequency = 48 + 60 * np.exp(-local * 24)
        phase = 2 * math.pi * np.cumsum(frequency) / rate
        audio[index:index + length] += 0.38 * np.sin(phase) * np.exp(-local * 18)

    for hit in np.arange(0.5, HERO_SECONDS, 1.0):
        index = int(hit * rate)
        length = min(int(0.15 * rate), frames - index)
        local = np.arange(length) / rate
        audio[index:index + length] += 0.10 * rng.normal(0, 1, length) * np.exp(-local * 25)

    # Partner-response chirps: a distinct high tone on alternating sides.
    for response in np.arange(0.25, HERO_SECONDS, 0.5):
        index = int(response * rate)
        length = min(int(0.12 * rate), frames - index)
        local = np.arange(length) / rate
        tone = np.sin(2 * math.pi * (430 + 160 * local) * local) * np.exp(-local * 24)
        audio[index:index + length] += 0.045 * tone

    # One-second lockup tail.
    tail = time >= HERO_SECONDS
    local = time[tail] - HERO_SECONDS
    audio[tail] += 0.12 * np.sin(2 * math.pi * 196 * local) * np.exp(-local * 5)
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


def text(value: str, size: int, y: int, color: str, border: int = 3) -> str:
    return (
        f"drawtext=fontfile={FONT_BOLD}:text='{escape(value)}':fontsize={size}:"
        f"fontcolor={color}:borderw={border}:bordercolor=black@0.9:"
        f"x=(w-tw)/2:y={y}"
    )


def hero_filter(
    source_index: int,
    message_index: int,
    width: int,
    height: int,
    scale: float,
) -> str:
    primary, secondary, label = MESSAGES[message_index]
    card_width = round(min(width * 0.90, (height * 0.66) / 1.264))
    card_height = round(card_width * 1.264)
    card_x = (width - card_width) // 2
    card_y = round(height * 0.105)
    panel_y = round(height * 0.765)
    title_size = round(65 * scale)
    secondary_size = round(42 * scale)
    label_size = round(25 * scale)
    crop_height = 900

    # The supplied duet screenshot's old wide banner lives above the controls.
    # Mask only that inherited banner while keeping the stage, partner tile,
    # floor, and control row visible.
    stage_steps = [
        f"[{source_index}:v]crop=712:{crop_height}:0:120",
        f"scale={round(card_width * 1.10)}:{round(card_height * 1.10)}:force_original_aspect_ratio=increase",
        f"crop={round(card_width * 1.10)}:{round(card_height * 1.10)}",
        (
            f"zoompan=z='1+{0.035 + message_index * 0.004}*on/{HERO_FRAMES - 1}':"
            f"x='(iw-iw/zoom)*{message_index % 2}*on/{HERO_FRAMES - 1}':"
            f"y='(ih-ih/zoom)/2':d={HERO_FRAMES}:s={card_width}x{card_height}:fps={FPS}"
        ),
        "eq=brightness=0.06:saturation=1.02:contrast=1.06",
        f"drawbox=x=0:y={round(card_height * 0.80)}:w={card_width}:h={round(card_height * 0.075)}:color=0x080910@0.98:t=fill",
        "drawbox=x=0:y=0:w=iw:h=ih:color=0x05070b@0.08:t=fill",
        f"pad={width}:{height}:{card_x}:{card_y}:color=0x05070b",
        f"drawbox=x={card_x - 4}:y={card_y - 4}:w={card_width + 8}:h={card_height + 8}:color=0xF2C14E@0.9:t=4",
        "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.16:t=fill",
        f"drawbox=x=0:y=0:w=iw:h={round(height * 0.10)}:color=0x05070b@0.90:t=fill",
        f"drawbox=x=0:y={panel_y}:w=iw:h={height - panel_y}:color=0x05070b@0.91:t=fill",
        f"drawbox=x=(iw-{round(190 * scale)})/2:y={round(height * 0.802)}:w={round(190 * scale)}:h={round(5 * scale)}:color=0xF2C14E:t=fill",
        text(label, label_size, round(height * 0.04), "0xF2C14E"),
        text(primary, title_size, round(height * 0.825), "white"),
        text(secondary, secondary_size, round(height * 0.90), "0xF2C14E"),
        f"drawbox=x={round(width * 0.08)}:y={round(height * 0.955)}:w={round(width * 0.84)}:h={round(4 * scale)}:color=0xF2C14E@0.35:t=fill",
        f"fade=t=in:st=0:d=0.22,fade=t=out:st={(HERO_FRAMES / FPS) - 0.22}:d=0.22",
        f"format=yuv420p,setsar=1[hero{message_index}]",
    ]
    return ",".join(stage_steps)


def lockup_filter(source_index: int, width: int, height: int, scale: float) -> str:
    logo_size = round(min(width * 0.70, height * 0.46))
    lockup_steps = [
        f"[{source_index}:v]scale={logo_size}:{logo_size}:force_original_aspect_ratio=decrease",
        f"pad={width}:{height}:(ow-iw)/2:{round(height * 0.12)}:color=0x05070b",
        "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.18:t=fill",
        text("GRAVELKING PRO", round(54 * scale), round(height * 0.70), "0xF2C14E"),
        text("LIVE DUETS / REAL-TIME / NO LAG", round(26 * scale), round(height * 0.80), "white"),
        text("gk advantage engine", round(24 * scale), round(height * 0.88), "0xF2C14E"),
        "fade=t=in:st=0:d=0.18",
        "format=yuv420p,setsar=1[lockup]",
    ]
    return ",".join(lockup_steps)


def render(output: Path, width: int, height: int, scale: float, audio: Path) -> None:
    command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    for _ in range(6):
        command += ["-i", str(HERO)]
    command += ["-i", str(LOGO), "-i", str(audio)]

    filters = [
        hero_filter(index, index, width, height, scale) for index in range(6)
    ]
    filters.append(lockup_filter(6, width, height, scale))
    filters.append(
        "".join(f"[hero{index}]" for index in range(6))
        + "[lockup]concat=n=7:v=1:a=0,format=yuv420p[vout]"
    )
    command += [
        "-filter_complex",
        ";".join(filters),
        "-map",
        "[vout]",
        "-map",
        "7:a",
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
    WORK.mkdir(parents=True, exist_ok=True)
    VIDEOS.mkdir(parents=True, exist_ok=True)
    for required in (HERO, LOGO):
        if not required.exists():
            raise SystemExit(f"Missing required artwork: {required}")
    audio = WORK / "live-duet-advantage-original.wav"
    make_audio(audio)
    render(
        VIDEOS / "gravelkingpro_live_duet_advantage_30s_phone_9x16.mp4",
        1080,
        1920,
        1.0,
        audio,
    )
    render(
        VIDEOS / "gravelkingpro_live_duet_advantage_30s_ipad_3x4.mp4",
        1620,
        2160,
        1.5,
        audio,
    )


if __name__ == "__main__":
    main()