#!/usr/bin/env python3
"""
GKP UVR Runner — Neural vocal separation via ONNX-based UVR MDX-Net models.
High-quality, CPU-fast replacement for center-channel cancellation.

Outputs JSON to stdout:
  voice_remove: {"instrumental": "/path/out.wav", "model": "..."}
  stem_split:   {"stems": {"vocals": "...", "instrumental": "..."}, "model": "..."}

All INFO/DEBUG logs from audio-separator go to stderr so they don't corrupt JSON stdout.
"""
import sys
import os
import json
import argparse
import logging

logging.basicConfig(
    level=logging.WARNING,
    stream=sys.stderr,
    format="%(levelname)s - %(message)s",
)
logging.getLogger("audio_separator").setLevel(logging.WARNING)
logging.getLogger("separator").setLevel(logging.WARNING)


def build_separator(model_dir: str, output_dir: str, single_stem: str | None = None):
    from audio_separator.separator import Separator
    return Separator(
        model_file_dir=model_dir,
        output_dir=output_dir,
        output_format="WAV",
        normalization_threshold=0.9,
        output_single_stem=single_stem,
    )


def find_stem(files: list[str], keywords: list[str]) -> str | None:
    for f in files:
        bn = os.path.basename(f).lower()
        if any(kw in bn for kw in keywords):
            return f
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="GKP UVR neural separator")
    parser.add_argument("--mode", choices=["voice_remove", "stem_split"], required=True)
    parser.add_argument("--input", required=True, help="Path to input audio file")
    parser.add_argument("--out", required=True, help="Output directory for separated stems")
    parser.add_argument(
        "--model-dir",
        default=os.path.expanduser("~/.cache/audio-separator"),
        help="Directory where models are cached / downloaded to",
    )
    args = parser.parse_args()

    try:
        from audio_separator.separator import Separator  # noqa: F401
    except ImportError as exc:
        json.dump({"error": f"audio-separator not installed: {exc}"}, sys.stdout)
        sys.exit(1)

    os.makedirs(args.out, exist_ok=True)

    MODEL = "UVR-MDX-NET-Inst_HQ_3.onnx"

    if args.mode == "voice_remove":
        sep = build_separator(args.model_dir, args.out, single_stem="Instrumental")
        sep.load_model(MODEL)
        output_files = sep.separate(args.input)

        if not output_files:
            json.dump({"error": "UVR produced no output files"}, sys.stdout)
            sys.exit(1)

        instrumental = (
            find_stem(output_files, ["instrumental", "inst_", "no_vocals"])
            or output_files[0]
        )
        json.dump(
            {"instrumental": instrumental, "model": MODEL.replace(".onnx", "")},
            sys.stdout,
        )

    elif args.mode == "stem_split":
        sep = build_separator(args.model_dir, args.out)
        sep.load_model(MODEL)
        output_files = sep.separate(args.input)

        stems: dict[str, str] = {}
        for f in output_files:
            bn = os.path.basename(f).lower()
            if "instrumental" in bn or "inst_" in bn or "no_vocals" in bn:
                stems["instrumental"] = f
            elif "vocals" in bn or "vocal" in bn:
                stems["vocals"] = f
            else:
                label = bn.replace(".wav", "").strip("() ")
                stems[label] = f

        json.dump(
            {"stems": stems, "files": output_files, "model": MODEL.replace(".onnx", "")},
            sys.stdout,
        )


if __name__ == "__main__":
    main()
