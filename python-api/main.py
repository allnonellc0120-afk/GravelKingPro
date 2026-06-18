import os
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
import tempfile
import subprocess

app = FastAPI(title="Python Audio API", description="FastAPI + ffmpeg for audio processing")

# Health check endpoint for Cloud Run
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "python-audio-api"}

# Upload audio + process with ffmpeg
@app.post("/process")
async def process_audio(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="File must be an audio file")
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_in:
        tmp_in.write(await file.read())
        tmp_in_path = tmp_in.name
    
    try:
        out_path = tmp_in_path.replace(".wav", "_processed.wav")
        # Run ffmpeg normalization
        subprocess.run(
            ["ffmpeg", "-y", "-i", tmp_in_path, "-af", "volumedetect", "-acodec", "pcm_s16le", out_path],
            check=True, capture_output=True, timeout=120
        )
        return FileResponse(out_path, media_type="audio/wav", filename="processed.wav")
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"ffmpeg failed: {e.stderr.decode()}")
    finally:
        os.unlink(tmp_in_path) if os.path.exists(tmp_in_path) else None

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
