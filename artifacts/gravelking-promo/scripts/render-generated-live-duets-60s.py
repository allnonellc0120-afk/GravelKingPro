#!/usr/bin/env python3
"""Render a generated Live Duets hero and append it to the existing promo.

The generated artwork is guided by the original Main Stage reference, but the
old stage video and its frames are not rendered into this export.
"""

from pathlib import Path
import math
import subprocess
import wave

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parents[1]
VIDEOS = ROOT / "public/videos"
WORK = ROOT / ".render-generated-live-duets-60s"
ARTWORK = WORKSPACE / "attached_assets/generated_images"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FPS = 30
HERO_SECONDS = 30
TOTAL_SECONDS = 60
FRAMES_PER_CARD = 10 * FPS

MAIN_STAGE = ARTWORK / "live-duet-main-stage-new.png"
ROLLING_LYRICS = ARTWORK / "live-duet-rolling-lyrics-new.png"
REMOTE_LEFT = WORKSPACE / "attached_assets/generated_videos/promo_v2/s16_singer.mp4"
REMOTE_RIGHT = WORKSPACE / "attached_assets/generated_videos/promo_v3/scene3_16x9.mp4"

EXISTING_PHONE = VIDEOS / "gravelkingpro_signal_to_song_30s_phone_9x16.mp4"
EXISTING_IPAD = VIDEOS / "gravelkingpro_signal_to_song_30s_ipad_3x4.mp4"


def make_audio(path: Path) -> None:
    """Create a fresh 30-second performance bed for the generated hero."""
    rate = 48_000
    frames = rate * HERO_SECONDS
    time = np.arange(frames, dtype=np.float64) / rate
    audio = np.zeros(frames, dtype=np.float64)
    rng = np.random.default_rng(20260922 + 42)

    chords = [
        (55.0, 82.41, 110.0),
        (65.41, 98.0, 130.81),
        (73.42, 110.0, 146.83),
    ]
    for number, chord in enumerate(chords):
        start = number * 10
        mask = (time >= start) & (time < start + 10)
        local = time[mask] - start
        fade = np.minimum(
            np.clip(local / 0.32, 0, 1),
            np.clip((10 - local) / 0.32, 0, 1),
        )
        pad = sum(np.sin(2 * math.pi * frequency * local) for frequency in chord)
        audio[mask] += 0.052 * pad * fade

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
            0.09 * rng.normal(0, 1, length) * np.exp(-local * 26)
        )

    for transition in (10, 20):
        index = int(transition * rate)
        length = min(int(0.8 * rate), frames - index)
        local = np.arange(length) / rate
        impact = np.sin(2 * math.pi * (75 - 35 * local) * local)
        audio[index:index + length] += 0.24 * impact * np.exp(-local * 5.5)

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


def card_filter(
    index: int,
    width: int,
    height: int,
    scale: float,
) -> str:
    artwork_size = round(min(width * 0.92, height * 0.57))
    artwork_x = (width - artwork_size) // 2
    artwork_y = round(height * 0.10)
    label_size = round(24 * scale)
    title_size = round(66 * scale)
    secondary_size = round(38 * scale)
    label_y = round(height * 0.04)
    title_y = round(height * 0.72)
    secondary_y = round(height * 0.82)

    if index == 1:
        source_filters = [
            "[1:v]fps=30,trim=duration=10,setpts=PTS-STARTPTS",
            f"scale={artwork_size}:{round(artwork_size * 9 / 16)}:force_original_aspect_ratio=increase",
            f"crop={artwork_size}:{round(artwork_size * 9 / 16)}",
            f"pad={artwork_size}:{artwork_size}:0:(oh-ih)/2:color=0x05070b",
            "eq=brightness=0.04:saturation=1.04:contrast=1.05",
        ]
    else:
        source_filters = [
            f"[{index}:v]scale={round(artwork_size * 1.08)}:{round(artwork_size * 1.08)}:force_original_aspect_ratio=increase",
            f"crop={round(artwork_size * 1.08)}:{round(artwork_size * 1.08)}",
            f"zoompan=z='1+0.035*on/{FRAMES_PER_CARD - 1}':"
            f"x='(iw-iw/zoom)*{index % 2}*on/{FRAMES_PER_CARD - 1}':"
            f"y='(ih-ih/zoom)/2':d={FRAMES_PER_CARD}:"
            f"s={artwork_size}x{artwork_size}:fps={FPS}",
            "eq=brightness=0.04:saturation=1.04:contrast=1.05",
        ]
    filters = source_filters + [
        f"pad={width}:{height}:{artwork_x}:{artwork_y}:color=0x05070b",
        f"drawbox=x={artwork_x - 4}:y={artwork_y - 4}:w={artwork_size + 8}:"
        f"h={artwork_size + 8}:color=0xF2C14E@0.9:t=4",
        f"drawbox=x=0:y=0:w=iw:h={round(height * 0.09)}:color=0x05070b@0.92:t=fill",
        f"drawbox=x=0:y={round(height * 0.66)}:w=iw:"
        f"h={height - round(height * 0.66)}:color=0x05070b@0.93:t=fill",
        f"drawbox=x=(iw-{round(190 * scale)})/2:y={round(height * 0.685)}:"
        f"w={round(190 * scale)}:h={round(5 * scale)}:color=0xF2C14E:t=fill",
        f"drawbox=x={round(width * 0.08)}:y={round(height * 0.95)}:"
        f"w={round(width * 0.84)}:h={round(4 * scale)}:color=0xF2C14E@0.35:t=fill",
    ]

    labels = [
        "MAIN STAGE / LIVE DUETS",
        "FROM ANYWHERE / LIVE",
        "PROMPT ROLLING / BOTH SINGING",
    ]
    filters.append(text(labels[index], label_size, label_y, "0xF2C14E"))

    if index == 0:
        filters.extend(
            [
                text("SING WITH A FRIEND", title_size, title_y, "white"),
                text("TWO VOICES. ONE STAGE.", secondary_size, secondary_y, "0xF2C14E"),
            ]
        )
    elif index == 1:
        filters.extend(
            [
                text("HEAR EACH OTHER", title_size, title_y, "white"),
                text("IN REAL TIME.", secondary_size, secondary_y, "0xF2C14E"),
            ]
        )
    else:
        # The final 10-second card carries the pitch, then the brand/link CTA.
        filters.extend(
            [
                f"{text('LIVE DUETS', round(64 * scale), title_y, '0xF2C14E')}:enable='between(t,0,3)'",
                f"{text('PROMPT ROLLING. BOTH SINGING.', round(31 * scale), secondary_y, 'white', 2)}:enable='between(t,0,3)'",
                f"{text('SAVE YOUR TAKE', round(61 * scale), title_y, 'white')}:enable='between(t,3,6)'",
                f"{text('LISTEN BACK  /  SHARE WITH FRIENDS', round(28 * scale), secondary_y, '0xF2C14E', 2)}:enable='between(t,3,6)'",
                f"{text('GRAVELKING PRO', round(52 * scale), round(height * 0.75), 'white')}:enable='between(t,6,10)'",
                f"{text('gravelkingpro.com  /  PLAY STORE — NOW LIVE', round(28 * scale), round(height * 0.84), '0xF2C14E', 2)}:enable='between(t,6,10)'",
            ]
        )

    filters.extend(
        [
            f"fade=t=in:st=0:d=0.28,fade=t=out:st={(FRAMES_PER_CARD / FPS) - 0.28}:d=0.28",
            f"format=yuv420p,setsar=1[hero{index}]",
        ]
    )
    return ",".join(filters)


def render_hero(
    output: Path,
    width: int,
    height: int,
    scale: float,
    audio: Path,
    remote_video: Path,
) -> None:
    command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    command += ["-i", str(MAIN_STAGE)]
    command += ["-stream_loop", "-1", "-i", str(remote_video)]
    command += ["-i", str(ROLLING_LYRICS)]
    command += ["-i", str(audio)]
    filters = [
        card_filter(index, width, height, scale)
        for index in range(3)
    ]
    filters.append("[hero0][hero1][hero2]concat=n=3:v=1:a=0,format=yuv420p[vout]")
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


def append_hero(output: Path, existing: Path, hero: Path) -> None:
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
    missing = [
        str(path)
        for path in [MAIN_STAGE, ROLLING_LYRICS, REMOTE_LEFT, REMOTE_RIGHT, EXISTING_PHONE, EXISTING_IPAD]
        if not path.exists()
    ]
    if missing:
        raise SystemExit("Missing required artwork or promo: " + ", ".join(missing))

    WORK.mkdir(parents=True, exist_ok=True)
    audio = WORK / "generated-live-duets-original.wav"
    make_audio(audio)
    remote_video = WORK / "remote-singers-actual-motion-10s.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-stream_loop",
            "-1",
            "-i",
            str(REMOTE_LEFT),
            "-stream_loop",
            "-1",
            "-i",
            str(REMOTE_RIGHT),
            "-filter_complex",
            "[0:v]fps=30,scale=960:1080:force_original_aspect_ratio=increase,crop=960:1080,eq=brightness=0.02:saturation=1.02[left];"
            "[1:v]fps=30,scale=960:1080:force_original_aspect_ratio=increase,crop=960:1080,eq=brightness=0.02:saturation=1.02[right];"
            "[left][right]hstack=inputs=2,drawbox=x=iw/2-2:y=0:w=4:h=ih:color=0xF2C14E@0.85:t=fill,format=yuv420p[v]",
            "-map",
            "[v]",
            "-t",
            "10",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            str(remote_video),
        ],
        check=True,
    )
    hero_phone = WORK / "generated-live-duets-30s-phone.mp4"
    hero_ipad = WORK / "generated-live-duets-30s-ipad.mp4"
    render_hero(hero_phone, 1080, 1920, 1.0, audio, remote_video)
    render_hero(hero_ipad, 1620, 2160, 1.5, audio, remote_video)
    append_hero(
        VIDEOS / "gravelkingpro_signal_to_song_generated_live_duets_60s_phone_9x16.mp4",
        EXISTING_PHONE,
        hero_phone,
    )
    append_hero(
        VIDEOS / "gravelkingpro_signal_to_song_generated_live_duets_60s_ipad_3x4.mp4",
        EXISTING_IPAD,
        hero_ipad,
    )
    print(hero_phone)
    print(hero_ipad)


if __name__ == "__main__":
    main()