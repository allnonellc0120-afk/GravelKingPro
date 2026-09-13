import streamlit as st
import numpy as np
import soundfile as sf
import io
import sys
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from morris_law_kernel import MorrisLawKernel, IntelligentMultiBandIsolator
from lyric_detector import add_to_vault, preflight_scan
from lib.gka_middleware import GKAdvantageCore
from verification_api import (
    GRAVELKING_VERIFY_URL,
    VerificationBackendError,
    verify_against_gravelking,
)

st.set_page_config(page_title="GravelKing Pro | Morris Law Kernel v3.5", layout="wide")
st.title("GravelKing Pro — Morris Law Kernel v3.5 + IP Protection")

kernel = MorrisLawKernel()
isolator = IntelligentMultiBandIsolator()
gka = GKAdvantageCore(multiplier=0.75, slice_size=2)

tab1, tab2, tab3, tab4 = st.tabs(
    ["Mastering", "Stem/Voice Isolation", "IP Protection", "Lyric Pre-Flight"]
)

with tab1:
    uploaded = st.file_uploader("Upload WAV", type=["wav"], key="m")
    if uploaded:
        load_err = None
        try:
            audio, sr = sf.read(io.BytesIO(uploaded.read()))
        except Exception as exc:
            load_err = f"Could not read that file as audio: {exc}"
        else:
            if np.asarray(audio).size == 0:
                load_err = "That file contains no audio samples."
        if load_err:
            st.error(load_err)
        else:
            st.audio(uploaded)
            preset = st.selectbox("Preset", list(MorrisLawKernel.PRESETS), index=5)
            intensity = st.slider("Intensity", 0, 100, 65)
            if st.button("Master"):
                try:
                    with gka.task(
                        "streamlit_mlk_master",
                        metadata={"preset": preset, "sample_rate": sr},
                    ):
                        k = MorrisLawKernel(sample_rate=sr)
                        optimized = gka.optimize_audio(
                            audio.astype(np.float32),
                            operation="streamlit_mlk_master_input",
                        )
                        processed = k.process(
                            optimized,
                            preset=preset,
                            intensity=float(intensity),
                        )
                except ValueError as exc:
                    st.error(f"Cannot master this file: {exc}")
                else:
                    buf = io.BytesIO()
                    sf.write(buf, processed, sr, format="WAV")
                    st.download_button("Download", buf.getvalue(), "mastered.wav")

with tab2:
    st.caption(
        "Pure-DSP band gating — fast and model-free. Expect bleed on shared "
        "frequencies; this is honest filter-bank isolation, not ML separation."
    )
    uploaded2 = st.file_uploader("Upload WAV", type=["wav"], key="i")
    if uploaded2:
        load_err2 = None
        try:
            audio2, sr2 = sf.read(io.BytesIO(uploaded2.read()))
        except Exception as exc:
            load_err2 = f"Could not read that file as audio: {exc}"
        else:
            if np.asarray(audio2).size == 0:
                load_err2 = "That file contains no audio samples."
        if load_err2:
            st.error(load_err2)
        else:
            stem = st.selectbox("Stem", ["vocals", "bass", "drums"])
            strength = st.slider("Strength", 0.0, 1.0, 0.85)
            if st.button("Isolate"):
                try:
                    with gka.task(
                        "streamlit_stem_isolation",
                        metadata={"stem": stem, "sample_rate": sr2},
                    ):
                        iso = IntelligentMultiBandIsolator(sample_rate=sr2)
                        optimized = gka.optimize_audio(
                            audio2.astype(np.float32),
                            operation="streamlit_stem_isolation_input",
                        )
                        result = iso.isolate_stem(optimized, stem, strength)
                except ValueError as exc:
                    st.error(f"Cannot isolate from this file: {exc}")
                else:
                    buf = io.BytesIO()
                    sf.write(buf, result, sr2, format="WAV")
                    st.download_button("Download", buf.getvalue(), f"{stem}_isolated.wav")

with tab3:
    st.subheader("Verify a track against the live GravelKing server")
    st.caption(
        "The nominator is read from the track's LSB watermark locally; the "
        "denominator + HMAC handshake are verified server-side (split-key). "
        f"Backend: {GRAVELKING_VERIFY_URL}"
    )
    uploaded3 = st.file_uploader("Upload WAV", type=["wav"], key="v")
    if uploaded3 and st.button("Verify Certification"):
        try:
            report = verify_against_gravelking(uploaded3.read(), uploaded3.name)
        except VerificationBackendError as exc:
            st.error(f"Verification backend error — no verdict was issued: {exc}")
        except Exception as exc:  # protocol/parse surprises: fail loudly, never mislabel
            st.error(f"Verification failed unexpectedly — no verdict was issued: {exc}")
        else:
            if report.get("valid"):
                st.success(
                    f"GravelKing certified — {report.get('artist')} "
                    f"(cert {report.get('certId')}, {report.get('kernel')})"
                )
            else:
                st.warning(f"Not verified: {report.get('reason') or report.get('error')}")
            st.json(report)

with tab4:
    st.subheader("Pre-flight copyright scan (local vault)")
    st.caption(
        "3-line n-gram hash matching against your local fingerprint vault. "
        "Advisory screening only — a clean result is not proof of originality "
        "and not legal clearance."
    )
    lyrics = st.text_area("Paste lyrics", height=220, key="lyrics")
    col_scan, col_add = st.columns(2)
    with col_scan:
        if st.button("Scan") and lyrics.strip():
            report = preflight_scan(lyrics)
            if report["matches_found"]:
                st.error(f"Overlap found — {len(report['window_matches'])} vault entr(y/ies) matched")
            elif report["vault_entries_checked"] == 0:
                st.warning("Vault is empty — nothing to screen against; no conclusion possible.")
            else:
                st.success(f"No overlap with {report['vault_entries_checked']} vault entr(y/ies)")
            st.json(report)
    with col_add:
        title = st.text_input("Title", key="vt")
        artist = st.text_input("Artist", key="va")
        if st.button("Add to vault (hashes only)") and lyrics.strip() and title and artist:
            entry = add_to_vault(title, artist, lyrics)
            st.success(f"Fingerprinted: {entry['title']} — {len(entry['window_hashes'])} windows")
