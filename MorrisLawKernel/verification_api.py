from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
import numpy as np
import soundfile as sf
import io
import hashlib
from datetime import datetime

app = FastAPI(title="GravelKing IP Verification API v3.5")

class VerificationReport(BaseModel):
    valid: bool
    user_id: str | None = None
    brand: str | None = None
    timestamp: str | None = None
    reasons: list[str]

@app.post("/verify", response_model=VerificationReport)
async def verify_audio(file: UploadFile = File(...)):
    data = await file.read()
    audio, sr = sf.read(io.BytesIO(data))
    if audio.ndim > 1: audio = np.mean(audio, axis=1)

    # In production: extract embedded payload and look up in DB
    # This is a simplified demo structure
    return VerificationReport(
        valid=True,
        user_id="kevin-morris-gravelking84",
        brand="GravelKing Productions",
        timestamp="2026-07-25T15:59:00Z",
        reasons=[]
    )

@app.get("/health")
async def health():
    return {"status": "healthy", "version": "3.5"}
