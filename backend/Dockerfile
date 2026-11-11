# ─── Build stage ──────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

# CPU wheels by default. For a GPU host build with:
#   --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cu124
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
# torch first, from the chosen index, so pip does not pull a CUDA build from PyPI.
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir torch --index-url ${TORCH_INDEX_URL} \
    && pip install --no-cache-dir -r requirements.txt

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HOME=/models/hf \
    LD_LIBRARY_PATH=/opt/venv/lib/python3.12/site-packages/nvidia/cublas/lib:/opt/venv/lib/python3.12/site-packages/nvidia/cudnn/lib

# Model cache: mount a volume on /models so BGE-M3 (~2.2 GB) is downloaded once.
RUN mkdir -p /models/hf && chown -R appuser:appuser /models

COPY --chown=appuser:appuser . .

RUN rm -rf tests/ requirements-dev.txt

USER appuser

EXPOSE 8000

# start-period covers the BGE-M3 load at startup.
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# One worker on purpose: each worker holds its own copy of the embedding model.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "1", "--loop", "uvloop", "--http", "httptools", \
     "--no-access-log"]