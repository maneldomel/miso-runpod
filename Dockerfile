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

# PyTorch 2.11 + CUDA 12.8 — versão confirmada no pod que roda MisoTTS
RUN pip install --no-cache-dir \
    torch==2.11.0 torchaudio==2.11.0 \
    --index-url https://download.pytorch.org/whl/cu128

# Extras — versões confirmadas no pod funcional + moshi/silentcipher que o pyproject.toml não lista
RUN pip install --no-cache-dir \
    numpy \
    huggingface_hub==0.28.1 \
    torchtune==0.6.1 \
    torchao==0.17.0 \
    moshi==0.2.2 \
    silentcipher \
    runpod

# MisoTTS — instala por último para moshi==0.2.2 e silentcipher==1.0.5 não serem sobrescritos
RUN git clone https://github.com/MisoLabsAI/MisoTTS.git /app/MisoTTS
WORKDIR /app/MisoTTS
RUN pip install --no-cache-dir .

WORKDIR /app
COPY handler.py .

CMD ["python", "-u", "handler.py"]
