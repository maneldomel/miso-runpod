"""
RunPod Serverless handler for MisoTTS.

Input:
  text                  str   (required) — text to synthesize (English)
  speaker               int   (default 0)
  temperature           float (default 0.4)
  topk                  int   (default 15)
  max_audio_length_ms   int   (default 90000)
  context               list  — [{text, audio_url, speaker}]

Output:
  audio_base64   str  — base64-encoded WAV (24 kHz mono)
  sample_rate    int  — 24000
"""

import os
import base64
import tempfile
import urllib.request
from io import BytesIO

import runpod
import torch
import torchaudio

# Model weights — mount RunPod network volume at /runpod-volume
HF_CACHE = os.environ.get("HF_HUB_CACHE", "/runpod-volume/hf_cache")
os.makedirs(HF_CACHE, exist_ok=True)
os.environ["HF_HUB_CACHE"] = HF_CACHE

from generator import load_miso_8b, Segment  # noqa: E402

print("Loading MisoTTS...", flush=True)
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
_gen = load_miso_8b(device=DEVICE)
print(f"Ready on {DEVICE}", flush=True)


def handler(job: dict) -> dict:
    inp = job.get("input", {})

    text = inp.get("text", "").strip()
    if not text:
        return {"error": "text is required"}

    speaker     = int(inp.get("speaker", 0))
    temperature = float(inp.get("temperature", 0.4))
    topk        = int(inp.get("topk", 15))
    max_ms      = int(inp.get("max_audio_length_ms", 90000))
    ctx_raw     = inp.get("context", [])

    segments = []
    for seg in ctx_raw:
        url = seg.get("audio_url", "")
        if not url:
            continue
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        try:
            urllib.request.urlretrieve(url, tmp.name)
            wav, sr = torchaudio.load(tmp.name)
            if sr != 24000:
                wav = torchaudio.functional.resample(wav, sr, 24000)
            segments.append(Segment(
                speaker=int(seg.get("speaker", 0)),
                text=seg.get("text", ""),
                audio=wav[0],
            ))
        finally:
            os.unlink(tmp.name)

    try:
        audio: torch.Tensor = _gen.generate(
            text=text,
            speaker=speaker,
            context=segments,
            temperature=temperature,
            topk=topk,
            max_audio_length_ms=max_ms,
        )
    except Exception as e:
        return {"error": str(e)}

    buf = BytesIO()
    torchaudio.save(buf, audio.unsqueeze(0), 24000, format="wav")
    return {
        "audio_base64": base64.b64encode(buf.getvalue()).decode(),
        "sample_rate": 24000,
    }


runpod.serverless.start({"handler": handler})
