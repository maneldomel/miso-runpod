FROM nvidia/cuda:12.8.1-cudnn-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    HF_HUB_CACHE=/runpod-volume/hf_cache \
    PYTHONPATH=/app/MisoTTS

RUN apt-get update && apt-get install -y \
    python3.10 python3.10-dev python3-pip git curl \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.10 /usr/bin/python \
    && ln -sf /usr/bin/pip3 /usr/bin/pip

# PyTorch 2.10 + CUDA 12.8 — suporta Blackwell (sm_120)
RUN pip install --no-cache-dir \
    torch==2.10.0 torchaudio==2.10.0 \
    --index-url https://download.pytorch.org/whl/cu128

# Install extras BEFORE MisoTTS so pip install . has final say on deps
RUN pip install --no-cache-dir numpy huggingface_hub torchtune torchao runpod

# MisoTTS source — pip install . runs last and ensures moshi/silentcipher are correct
RUN git clone https://github.com/MisoLabsAI/MisoTTS.git /app/MisoTTS
WORKDIR /app/MisoTTS
RUN pip install --no-cache-dir .

WORKDIR /app
COPY handler.py .

CMD ["python", "-u", "handler.py"]
