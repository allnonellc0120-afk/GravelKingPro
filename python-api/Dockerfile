# GravelKing Productions — Demucs Cloud Run Container
# Deploys htdemucs neural source separation to Google Cloud Run.
# Build: gcloud run deploy gkp-demucs --source python-api/ ...
FROM python:3.11-slim

WORKDIR /app

# System deps: ffmpeg (audio I/O) + build tools for torch
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install PyTorch CPU-only first (needs extra index URL — must be separate from requirements.txt)
RUN pip install --no-cache-dir \
    torch==2.3.1 torchaudio==2.3.1 \
    --extra-index-url https://download.pytorch.org/whl/cpu

# Install demucs and remaining deps
RUN pip install --no-cache-dir demucs

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download htdemucs model weights at build time (~80MB) to avoid cold-start delay.
# If the build environment has no internet, this is skipped silently.
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs'); print('Model cached.')" || \
    echo "Model pre-download skipped — will download on first request."

COPY main.py .

# Cloud Run injects PORT; uvicorn reads it at startup
EXPOSE 8080
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --timeout-keep-alive 620"]
