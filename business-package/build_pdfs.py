#!/usr/bin/env python3
"""Convert the Morris Law Kernel business documents (markdown) into branded PDFs.

Pipeline: strip first H1 -> pandoc (gfm -> typst fragment) -> wrap with branded
preamble -> typst compile. Fails loudly on any document that cannot be built.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "pdf"
PREAMBLE = (ROOT / "template" / "preamble.typ").read_text()

# filename stem -> clean display title
TITLES = {
    "MASTER_PACKAGE_INDEX": "Master Package Index",
    "WHITE_PAPER_Morris_Law_Kernel_v3.5": "White Paper: Morris Law Kernel v3.5",
    "ONE_PAGE_EXECUTIVE_SUMMARY": "One-Page Executive Summary",
    "PITCH_DECK_Morris_Law_Kernel_v3.5": "Pitch Deck — Content Outline",
    "PITCH_DECK_VISUALS_DESIGN": "Pitch Deck — Visual Design Guide",
    "FINANCIAL_PROJECTIONS": "Financial Projections",
    "FINANCIAL_PLAN_0_30_Days_Bootstrapped": "0-30 Day Financial Plan (Bootstrapped)",
    "LICENSING_TERMS_TEMPLATE": "Licensing Terms Template",
    "DATA_ROOM_STRUCTURE": "Data Room Structure",
    "DATA_ROOM_CHECKLIST": "Data Room Checklist",
    "INVESTOR_PARTNER_EMAIL_TEMPLATES": "Investor & Partner Email Templates",
    "LINKEDIN_OUTREACH": "LinkedIn Outreach Playbook",
    "7_DAY_PROMO_POSTS": "7-Day Promo Content Calendar",
    "DEMO_VIDEO_SCRIPT": "Demo Video Script",
    "OUTREACH_TRACKER": "Outreach Tracker Template",
    "START_HERE_Simple_Guide": "Start Here — Simple Guide to Your Package",
    "TECHNICAL_ARCHITECTURE_OVERVIEW": "Technical Architecture Overview",
}


def find_font_dir() -> str | None:
    """Locate the directory holding the Inter TTF/OTF files via fontconfig."""
    try:
        out = subprocess.run(["fc-list"], capture_output=True, text=True, check=True).stdout
    except Exception:
        return None
    for line in out.splitlines():
        path, _, rest = line.partition(":")
        if "inter" in Path(path).name.lower() and "Inter" in rest:
            return str(Path(path).parent)
    return None


def build_one(md_path: Path, font_dir: str | None, tmp: Path) -> Path:
    stem = md_path.stem
    title = TITLES.get(stem, stem.replace("_", " ").title())
    text = md_path.read_text()

    # Drop the first H1 (the preamble renders the title block instead)
    text = re.sub(r"^#\s+.*\n+", "", text, count=1)

    body_md = tmp / f"{stem}.body.md"
    body_typ = tmp / f"{stem}.body.typ"
    full_typ = tmp / f"{stem}.typ"
    body_md.write_text(text)

    subprocess.run(
        ["pandoc", "-f", "gfm", "-t", "typst", "--wrap=none", "-o", str(body_typ), str(body_md)],
        check=True,
    )
    full_typ.write_text(PREAMBLE.replace("__DOCTITLE__", title) + "\n" + body_typ.read_text())

    out_pdf = OUT / f"{stem}.pdf"
    cmd = ["typst", "compile"]
    if font_dir:
        cmd += ["--font-path", font_dir]
    cmd += [str(full_typ), str(out_pdf)]
    subprocess.run(cmd, check=True)
    return out_pdf


def main() -> int:
    OUT.mkdir(exist_ok=True)
    font_dir = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else find_font_dir()
    print(f"Inter font dir: {font_dir or 'NOT FOUND (falling back to DejaVu Sans)'}")

    sources = sorted(SRC.glob("*.md"))
    if not sources:
        print("No markdown sources found", file=sys.stderr)
        return 1

    failures = []
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for md in sources:
            try:
                pdf = build_one(md, font_dir, tmp)
                print(f"OK   {pdf.name}  ({pdf.stat().st_size // 1024} KB)")
            except subprocess.CalledProcessError as e:
                failures.append(md.name)
                print(f"FAIL {md.name}: {e}", file=sys.stderr)

    if failures:
        print(f"\n{len(failures)} failure(s): {failures}", file=sys.stderr)
        return 1
    print(f"\nAll {len(sources)} PDFs built into {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
