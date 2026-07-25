import streamlit as st
import numpy as np
import soundfile as sf
import io
from morris_law_kernel import MorrisLawKernel, IntelligentMultiBandIsolator

st.set_page_config(page_title="GravelKing Pro | Morris Law Kernel v3.5", layout="wide")
st.title("GravelKing Pro — Morris Law Kernel v3.5 + IP Protection")

kernel = MorrisLawKernel()
isolator = IntelligentMultiBandIsolator()

tab1, tab2, tab3 = st.tabs(["Mastering", "Stem/Voice Isolation", "IP Protection"])

with tab1:
    uploaded = st.file_uploader("Upload WAV", type=["wav"], key="m")
    if uploaded:
        audio, sr = sf.read(io.BytesIO(uploaded.read()))
        st.audio(uploaded)
        if st.button("Master"):
            processed = kernel.process(audio.astype(np.float32))
            buf = io.BytesIO()
            sf.write(buf, processed, sr, format="WAV")
            st.download_button("Download", buf.getvalue(), "mastered.wav")

with tab2:
    uploaded2 = st.file_uploader("Upload WAV", type=["wav"], key="i")
    if uploaded2:
        audio2, sr2 = sf.read(io.BytesIO(uploaded2.read()))
        if st.button("Isolate Voice"):
            result = isolator.isolate_voice(audio2.astype(np.float32))
            buf = io.BytesIO()
            sf.write(buf, result, sr2, format="WAV")
            st.download_button("Download", buf.getvalue(), "voice_isolated.wav")

with tab3:
    st.info("IP Protection features ready. Full cryptographic signing happens on backend.")
    st.write("Connects to verification_api.py and ip_protection_system.ts")
