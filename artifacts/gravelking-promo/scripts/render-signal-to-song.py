#!/usr/bin/env python3
"""Render a clean-room GravelKing Pro promo from still artwork and new audio.

This deliberately does not read, crop, reframe, or remix any previous promo
video. Every frame is composed from standalone artwork with a new scene order,
new copy, new timing, and a newly synthesized music bed.
"""

from pathlib import Path
import math
import subprocess
import wave

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "public/images"
VIDEOS = ROOT / "public/videos"
WORK = ROOT / ".render-signal-to-song"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
DURATION = 30
FPS = 30

SCENES = [
    ("studio_bg.jpg", "FROM FIRST TAKE", "TO FINISHED RECORD", "THE RECORD STARTS HERE"),
    ("vocal_booth.jpg", "CAPTURE", "THE PERFORMANCE", "VOCAL BOOTH"),
    ("daw_abstract.jpg", "SHAPE", "THE SOUND", "STUDIO TOOLS"),
    ("crypto_cert.jpg", "PROTECT", "THE WORK", "BUILT-IN PROOF"),
    ("gold_record.jpg", "MASTER", "FOR RELEASE", "RELEASE READY"),
    ("gk_hammer_logo.png", "GRAVELKING PRO", "MAKE IT. MASTER IT. OWN IT.", "gravelkingpro.com"),
]


def synthesize_audio(path: Path) -> None:
    """Create an original 120 BPM electronic bed without using prior audio."""
    sample_rate = 48_000
    frames = sample_rate * DURATION
    t = np.arange(frames, dtype=np.float64) / sample_rate
    music = np.zeros(frames, dtype=np.float64)

    # Warm harmonic pad with a slow filter-like movement.
    chord_sets = [
        (55.00, 82.41, 110.00),
        (49.00, 73.42, 98.00),
        (41.20, 61.74, 82.41),
        (55.00, 69.30, 82.41),
        (49.00, 73.42, 110.00),
        (55.00, 82.41, 123.47),
    ]
    for scene, chord in enumerate(chord_sets):
        start = scene * 5
        mask = (t >= start) & (t < start + 5)
        local = t[mask] - start
        fade = np.minimum(np.clip(local / 0.35, 0, 1), np.clip((5 - local) / 0.35, 0, 1))
        pad = sum(np.sin(2 * math.pi * frequency * local) for frequency in chord)
        music[mask] += 0.045 * pad * fade * (0.72 + 0.28 * np.sin(2 * math.pi * 0.16 * local))

    rng = np.random.default_rng(20260922)
    # Kick, snare, and hi-hat pattern.
    for beat in np.arange(0, DURATION, 0.5):
        index = int(beat * sample_rate)
        length = min(int(0.22 * sample_rate), frames - index)
        local = np.arange(length) / sample_rate
        sweep = 46 + 55 * np.exp(-local * 22)
        phase = 2 * math.pi * np.cumsum(sweep) / sample_rate
        music[index:index + length] += 0.42 * np.sin(phase) * np.exp(-local * 18)

    for snare in np.arange(0.5, DURATION, 1.0):
        index = int(snare * sample_rate)
        length = min(int(0.16 * sample_rate), frames - index)
        local = np.arange(length) / sample_rate
        noise = rng.normal(0, 1, length)
        music[index:index + length] += 0.11 * noise * np.exp(-local * 24)

    for hat in np.arange(0, DURATION, 0.25):
        index = int(hat * sample_rate)
        length = min(int(0.045 * sample_rate), frames - index)
        local = np.arange(length) / sample_rate
        noise = rng.normal(0, 1, length)
        music[index:index + length] += 0.035 * noise * np.exp(-local * 75)

    # Short transition impacts between the six visual scenes.
    for transition in (5, 10, 15, 20, 25):
        index = int(transition * sample_rate)
        length = min(int(0.7 * sample_rate), frames - index)
        local = np.arange(length) / sample_rate
        impact = np.sin(2 * math.pi * (75 - 35 * local) * local)
        music[index:index + length] += 0.24 * impact * np.exp(-local * 5.5)

    # Clean fade at the end and soft-limit.
    end_fade = np.ones(frames)
    fade_frames = int(1.1 * sample_rate)
    end_fade[-fade_frames:] = np.linspace(1, 0, fade_frames)
    music = np.tanh(music * 1.35) * end_fade

    # Slight stereo movement generated from the same original signal.
    left = music
    right = np.roll(music, 37)
    right[:37] = 0
    stereo = np.stack([left, right], axis=1)
    pcm = np.int16(np.clip(stereo, -1, 1) * 32767)

    with wave.open(str(path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(pcm.tobytes())


def esc(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:")


def draw_text(
    value: str,
    size: int,
    y: str,
    color: str,
    font: str = FONT_BOLD,
    border: int = 3,
) -> str:
    return (
        f"drawtext=fontfile={font}:text='{esc(value)}':fontsize={size}:"
        f"fontcolor={color}:borderw={border}:bordercolor=black@0.88:"
        f"x=(w-tw)/2:y={y}"
    )


def scene_filter(
    index: int,
    width: int,
    height: int,
    scale: float,
    primary: str,
    secondary: str,
    label: str,
) -> str:
    title_size = round((84 if index in (0, 5) else 105) * scale)
    secondary_size = round((44 if index in (0, 5) else 56) * scale)
    label_size = round(27 * scale)
    line_width = round(210 * scale)
    image_height = round(height * (0.62 if index == 5 else 0.68))
    image_y = round(height * 0.12)

    # Slow, different movement per scene prevents a slideshow feel.
    zoom = 1.06 + (index % 3) * 0.015
    pan_x = (
        "(iw-iw/zoom)*on/(150-1)"
        if index % 2 == 0
        else "(iw-iw/zoom)*(1-on/(150-1))"
    )
    pan_y = "(ih-ih/zoom)/2"
    motion = (
        f"[{index}:v]scale={width * 2}:{height * 2}:force_original_aspect_ratio=increase,"
        f"crop={width * 2}:{height * 2},"
        f"zoompan=z='1+({zoom}-1)*on/149':x='{pan_x}':y='{pan_y}':"
        f"d=150:s={width}x{height}:fps={FPS},"
        "eq=brightness=-0.05:saturation=0.92:contrast=1.08,"
        f"fade=t=in:st=0:d=0.28,fade=t=out:st=4.72:d=0.28[img{index}]"
    )

    graphics = [
        "drawbox=x=0:y=0:w=iw:h=ih:color=0x05070b@0.22:t=fill",
        f"drawbox=x=0:y={image_y}:w=iw:h={image_height}:color=black@0.10:t=fill",
        f"drawbox=x=0:y=0:w=iw:h={round(height * 0.11)}:color=0x05070b@0.88:t=fill",
        f"drawbox=x=0:y={round(height * 0.76)}:w=iw:h={round(height * 0.24)}:"
        "color=0x05070b@0.86:t=fill",
        f"drawbox=x=(iw-{line_width})/2:y={round(height * 0.795)}:"
        f"w={line_width}:h={max(4, round(5 * scale))}:color=0xF2C14E@1:t=fill",
        draw_text(label, label_size, str(round(height * 0.045)), "0xF2C14E"),
        draw_text(primary, title_size, str(round(height * 0.82)), "white"),
        draw_text(secondary, secondary_size, str(round(height * 0.90)), "0xF2C14E"),
    ]

    if index == 5:
        graphics.extend(
            [
                f"drawbox=x={round(70 * scale)}:y={round(height * 0.955)}:"
                f"w=iw-{round(140 * scale)}:h={round(58 * scale)}:"
                "color=0xF2C14E@1:t=fill",
                draw_text(
                    "START FREE",
                    round(27 * scale),
                    str(round(height * 0.964)),
                    "0x05070b",
                    border=0,
                ),
            ]
        )

    return motion + f";[img{index}]" + ",".join(graphics) + f"[scene{index}]"


def render(output: Path, width: int, height: int, scale: float, audio: Path) -> None:
    command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    for filename, *_ in SCENES:
        # A single decoded still becomes exactly 150 frames in zoompan. Looping
        # the input would multiply every scene to minutes and prevent concat
        # from advancing during this 30-second export.
        command += ["-i", str(IMAGES / filename)]
    command += ["-i", str(audio)]

    filters = [
        scene_filter(index, width, height, scale, primary, secondary, label)
        for index, (_, primary, secondary, label) in enumerate(SCENES)
    ]
    filters.append(
        "".join(f"[scene{index}]" for index in range(len(SCENES)))
        + f"concat=n={len(SCENES)}:v=1:a=0,format=yuv420p[vout]"
    )

    command += [
        "-filter_complex",
        ";".join(filters),
        "-map",
        "[vout]",
        "-map",
        "6:a",
        "-t",
        str(DURATION),
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
    missing = [str(IMAGES / filename) for filename, *_ in SCENES if not (IMAGES / filename).exists()]
    if missing:
        raise SystemExit("Missing required artwork: " + ", ".join(missing))

    audio = WORK / "signal-to-song-original.wav"
    synthesize_audio(audio)
    render(
        VIDEOS / "gravelkingpro_signal_to_song_30s_phone_9x16.mp4",
        1080,
        1920,
        1.0,
        audio,
    )
    render(
        VIDEOS / "gravelkingpro_signal_to_song_30s_ipad_3x4.mp4",
        1620,
        2160,
        1.5,
        audio,
    )


if __name__ == "__main__":
    main()