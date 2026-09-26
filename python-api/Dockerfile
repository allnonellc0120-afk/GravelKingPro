# Multi-band DSP Kernel Cloud Run Container
FROM python:3.11-slim

# System environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080

WORKDIR /app

# Install native dependencies if needed (slim versions occasionally require shared library headers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Optimize pip layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy DSP core application
COPY main.py .

# Run on the standard Cloud Run dynamic port bindings
EXPOSE 8080

CMD ["python", "main.py"]
