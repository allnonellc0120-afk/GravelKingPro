import os
import io
import math
import numpy as np
from scipy import signal
from fastapi import FastAPI, UploadFile, File, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict

app = FastAPI(
    title="GravelKing Sovereign Audio DSP Engine",
    description="High-fidelity, memory-contiguous multi-band DSP amplitude/spectral Carver using Morris Law Kernel V2 mechanics.",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Persistent filter states map to prevent click/pop artifacts on stream segments
# Maps session_id -> Dict of 'low_zi', 'mid_zi', 'high_zi' states
filter_states: Dict[str, dict] = {}

class DSPConfig(BaseModel):
    sample_rate: int = 44100
    low_gain: float = 1.0     # Multiplier for 20-250 Hz
    mid_gain: float = 1.0     # Multiplier for 250-4000 Hz
    high_gain: float = 1.0    # Multiplier for 4000-20000 Hz
    master_gain: float = 0.75 # Default GravelKing Morris Law multiplier

def init_multiband_filters(sr: int):
    """
    Computes high-fidelity IIR Butterworth band splits.
    Returns: (b_low, a_low), (b_mid, a_mid), (b_high, a_high) coefficients
    """
    nyq = 0.5 * sr
    
    # 2nd-order Butterworth filters are computationally fast and maintain phase integrity
    # Low Band: 20 Hz to 250 Hz
    b_low, a_low = signal.butter(2, [20 / nyq, 250 / nyq], btype='bandpass')
    # Mid Band: 250 Hz to 4000 Hz
    b_mid, a_mid = signal.butter(2, [250 / nyq, 4000 / nyq], btype='bandpass')
    # High Band: 4000 Hz to min(20000, nyq - 100) Hz
    high_cutoff = min(20000.0, nyq - 100.0)
    b_high, a_high = signal.butter(2, [4000 / nyq, high_cutoff / nyq], btype='bandpass')
    
    return (b_low, a_low), (b_mid, a_mid), (b_high, a_high)

def process_audio_stream_chunk(
    chunk_bytes: bytes,
    sample_rate: int,
    low_gain: float,
    mid_gain: float,
    high_gain: float,
    master_gain: float,
    format_type: str = "float32",
    session_id: Optional[str] = None
) -> bytes:
    """
    Apply high-fidelity DSP processing without growing the memory stack.
    Operates chunk-by-chunk using SciPy's linear filter state-space ('zi' tracking).
    """
    if len(chunk_bytes) == 0:
        return b""
        
    # Interpret raw byte-stream depending on the byte-depth request
    if format_type == "float32":
        dtype = np.float32
        bytes_per_sample = 4
    elif format_type == "int16":
        dtype = np.int16
        bytes_per_sample = 2
    else:
        # Standard uint8/int8 falls back to 8-bit signal representation
        dtype = np.uint8
        bytes_per_sample = 1

    # Chunk sizing alignment
    num_samples = len(chunk_bytes) // bytes_per_sample
    if num_samples == 0:
        return b""
        
    aligned_bytes = chunk_bytes[:num_samples * bytes_per_sample]
    samples = np.frombuffer(aligned_bytes, dtype=dtype).copy()
    
    # Float conversion for raw calculations (avoid overflows and clipping errors)
    if dtype == np.int16:
        float_samples = samples.astype(np.float32) / 32768.0
    elif dtype == np.uint8:
        float_samples = (samples.astype(np.float32) - 128.0) / 128.0
    else:
        float_samples = samples.astype(np.float32)
        
    # Retrieve bandpass coefficients
    (b_l, a_l), (b_m, a_m), (b_h, a_h) = init_multiband_filters(sample_rate)
    
    # Handle persistent states across continuous buffers to eliminate clicks/pops
    if session_id:
        if session_id not in filter_states:
            filter_states[session_id] = {
                "low_zi": signal.lfilter_zi(b_l, a_l) * float_samples[0],
                "mid_zi": signal.lfilter_zi(b_m, a_m) * float_samples[0],
                "high_zi": signal.lfilter_zi(b_h, a_h) * float_samples[0],
            }
        states = filter_states[session_id]
        
        # Apply filters with state injection and record feedback
        low_band, states["low_zi"] = signal.lfilter(b_l, a_l, float_samples, zi=states["low_zi"])
        mid_band, states["mid_zi"] = signal.lfilter(b_m, a_m, float_samples, zi=states["mid_zi"])
        high_band, states["high_zi"] = signal.lfilter(b_h, a_h, float_samples, zi=states["high_zi"])
    else:
        # One-off chunk filter processing (stateless)
        low_band = signal.lfilter(b_l, a_l, float_samples)
        mid_band = signal.lfilter(b_m, a_m, float_samples)
        high_band = signal.lfilter(b_h, a_h, float_samples)
        
    # Reassemble multi-band signal according to specified amplitude layout weights
    # Morris Law multiplier governs the overall volume ceiling (default 0.75)
    reconstructed = (
        (low_band * low_gain) + 
        (mid_band * mid_gain) + 
        (high_band * high_gain)
    ) * master_gain
    
    # Absolute peak limiter to avoid digital clipping (contiguity protection)
    reconstructed = np.clip(reconstructed, -1.0, 1.0)
    
    # Re-normalize to original bit-depth
    if dtype == np.int16:
        out_samples = (reconstructed * 32767.0).astype(np.int16)
    elif dtype == np.uint8:
        out_samples = ((reconstructed * 127.0) + 128.0).astype(np.uint8)
    else:
        out_samples = reconstructed.astype(np.float32)
        
    return out_samples.tobytes()

@app.post("/process-audio")
async def process_audio(
    x_gravelking_v3_protocol: Optional[str] = Header(None, alias="X-GravelKing-V3-Protocol"),
    authorization: Optional[str] = Header(None),
    sample_rate: int = Query(44100, description="Sampling rate of raw audio"),
    format_type: str = Query("float32", regex="^(float32|int16|uint8)$"),
    session_id: Optional[str] = Query(None, description="Stream session ID memory linkage"),
    low_gain: float = Query(1.0, description="Bass band gain"),
    mid_gain: float = Query(1.5, description="Midrange vocal band gain"),
    high_gain: float = Query(1.2, description="Cymbal/Shine band gain"),
    master_gain: float = Query(0.75, description="Morris Law multiplier (0.75 default)"),
    payload: bytes = File(..., description="Contiguous binary raw audio stream chunk")
):
    """
    Sovereign endpoint handling memory-contiguous direct binary processing.
    Fulfills non-mock spectral band carver and direct stream return.
    """
    # Authenticate token if present in environment
    secret = os.environ.get("GRAVELKING_SECRET", "gravelking_v3_secret_token_123")
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        if token != secret.strip():
            raise HTTPException(status_code=401, detail="INVALID_CREDENTIALS: Match check failed.")

    processed_bytes = process_audio_stream_chunk(
        chunk_bytes=payload,
        sample_rate=sample_rate,
        low_gain=low_gain,
        mid_gain=mid_gain,
        high_gain=high_gain,
        master_gain=master_gain,
        format_type=format_type,
        session_id=session_id
    )

    # Compile sovereign headers
    headers = {
        "X-Stability-Quorum": "MONITOR_100",
        "X-GravelKing-V3-Protocol": "REGENERATIVE_FLOW",
        "X-Offload-Fidelity": "NATIVE_RAW",
        "Content-Type": "application/octet-stream"
    }

    return StreamingResponse(io.BytesIO(processed_bytes), headers=headers)

@app.get("/health")
def api_health():
    return {
        "status": "ONLINE",
        "system": "GravelKing Sovereign DSP API",
        "engine": "Morris Law Kernel V2 Active",
        "scipy_integration": "scipy.signal.butter.lfilter_zi"
    }

@app.delete("/session/{session_id}")
def clear_session(session_id: str):
    if session_id in filter_states:
        del filter_states[session_id]
        return {"status": "SUCCESS", "message": f"Cleared persistent stream states for {session_id}"}
    return {"status": "NOT_FOUND"}

if __name__ == "__main__":
    import uvicorn
    # Cloud Run defaults to PORT environment variable, usually 8080 or 3000
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, log_level="info")
