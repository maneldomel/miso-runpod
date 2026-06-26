# MisoTTS RunPod — Setup & Operação

## Infraestrutura

| Recurso | Valor |
|---|---|
| RunPod Endpoint | `aggwq17a53jk4j` |
| GitHub repo (Docker) | `maneldomel/miso-runpod` |
| Network volume | `eldest_harlequin_wolverine` (500GB) |
| Pod de desenvolvimento | `circular_violet_carp` |
| GPU target | RTX PRO 6000 Blackwell (sm_120) |
| Supabase projeto | `xwjipmmcnnhxjfbolhjs` |

---

## Pod de Desenvolvimento (circular_violet_carp)

### Conectar via SSH
```bash
ssh -i ~/.ssh/claude_vps root@198.13.252.40 -p 30679
```

> IP e porta podem mudar após restart — verificar no RunPod dashboard em **Connect → SSH over exposed TCP**.

### Ativar ambiente MisoTTS
```bash
source /workspace/misotts_env/bin/activate
cd /workspace/MisoTTS
```

### Rodar geração de áudio (sem clonar voz)
```bash
export HF_HUB_CACHE=/workspace/hf_cache
export HF_HUB_ENABLE_HF_TRANSFER=0
python run_misotts.py
```
Output salvo em `/workspace/MisoTTS/full_conversation.wav`.

### Rodar servidor HTTP local (FastAPI)
```bash
source /workspace/misotts_env/bin/activate
export HF_HUB_CACHE=/workspace/hf_cache
cd /workspace/MisoTTS
python miso_server.py --port 8765
```

Endpoints:
- `POST /generate` — envia job de geração
- `GET /status/{job_id}` — status do job
- `GET /results/{filename}` — download do WAV

---

## Pacotes instalados no misotts_env

| Pacote | Versão |
|---|---|
| torch | 2.11.0+cu128 |
| torchaudio | 2.11.0+cu128 |
| torchtune | 0.6.1 |
| torchao | 0.17.0 |
| moshi | 0.2.2 |
| silentcipher | 1.0.5 |
| huggingface-hub | 0.28.1 |
| numpy | 2.1.2 |

---

## Model Weights

Pesos baixados em `/workspace/hf_cache/` (network volume, acessível no serverless em `/runpod-volume/hf_cache`):

```
/workspace/hf_cache/
├── models--MisoLabs--MisoTTS/          # ~32.8GB
├── models--kyutai--moshiko-pytorch-bf16/
└── models--sony--silentcipher/
```

Para baixar do zero (caso o blob esteja corrompido):
```bash
rm /workspace/hf_cache/models--MisoLabs--MisoTTS/blobs/<hash>
export HF_HUB_CACHE=/workspace/hf_cache
export HF_HUB_ENABLE_HF_TRANSFER=0
python run_misotts.py
```

---

## RunPod Serverless

### Disparar job via API
```bash
curl -X POST https://api.runpod.ai/v2/aggwq17a53jk4j/run \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "text": "Texto a ser gerado",
      "speaker": 0,
      "temperature": 0.4,
      "topk": 15,
      "max_audio_length_ms": 90000,
      "context": []
    }
  }'
```

### Com clonagem de voz (context)
```json
{
  "input": {
    "text": "Texto a ser gerado",
    "speaker": 0,
    "temperature": 0.4,
    "topk": 15,
    "context": [
      {
        "speaker": 0,
        "text": "texto do audio de referencia",
        "audio_url": "https://url-publica-do-audio.wav"
      }
    ]
  }
}
```

### Checar status
```bash
curl https://api.runpod.ai/v2/aggwq17a53jk4j/status/<job_id> \
  -H "Authorization: Bearer $RUNPOD_API_KEY"
```

---

## Docker Build

O build é automático via GitHub Actions quando há push no repo `maneldomel/miso-runpod`.

### Dockerfile — ordem de instalação (importante)
1. `torch==2.11.0 torchaudio==2.11.0` — cu128 index
2. `numpy huggingface_hub==0.28.1 torchtune==0.6.1 torchao==0.17.0 moshi==0.2.2 silentcipher runpod`
3. `pip install .` no MisoTTS (clona do GitHub)

> **Nota**: `moshi` e `silentcipher` precisam ser instalados explicitamente — o `pyproject.toml` do MisoTTS não os lista como deps.

### Variáveis de ambiente no container
```
HF_HUB_CACHE=/runpod-volume/hf_cache
PYTHONPATH=/app/MisoTTS
PYTHONUNBUFFERED=1
```

---

## Supabase Functions

| Function | Rota | Descrição |
|---|---|---|
| `miso-generate` | `POST /functions/v1/miso-generate` | Recebe texto, submete job ao RunPod, insere job na tabela `jobs` |
| `miso-webhook` | `POST /functions/v1/miso-webhook?jobId=<id>` | Recebe callback do RunPod, faz upload do WAV no storage, atualiza status |
| `miso-poll` | `GET /functions/v1/miso-poll?jobId=<id>` | Polling manual de status (fallback) |

### Deploy das functions
```bash
cd "d:/Shipping Caps AI"
supabase functions deploy miso-generate --no-verify-jwt
supabase functions deploy miso-webhook --no-verify-jwt
supabase functions deploy miso-poll --no-verify-jwt
```

### Secrets necessários no Supabase
```
RUNPOD_API_KEY
RUNPOD_MISO_ENDPOINT_ID=aggwq17a53jk4j
SUPABASE_SERVICE_ROLE_KEY
```

---

## Frontend

Tab **Miso Audio** em `shipping-caps-panel/src/pages/audio/MisoPage.tsx`.

Iniciar dev server:
```bash
cd "d:/Shipping Caps AI/shipping-caps-panel"
npm run dev
# → http://localhost:5173
```

---

## Troubleshooting

| Erro | Causa | Fix |
|---|---|---|
| `No module named 'moshi'` | moshi não no pyproject.toml | Adicionar `moshi==0.2.2` no Dockerfile |
| `No module named 'torchtune'` | torchtune não instalado | Adicionar `torchtune==0.6.1` no Dockerfile |
| `No module named 'huggingface_hub'` | não instalado | Adicionar `huggingface_hub==0.28.1` no Dockerfile |
| `Disk quota exceeded` | /tmp pequeno + hf_transfer | `export HF_HUB_ENABLE_HF_TRANSFER=0` |
| `RunPod 404 on /run` | URL errada | Usar `api.runpod.ai` (não `.io`) |
| Worker crash sem traceback | Build falhou silenciosamente | Verificar aba Builds no RunPod |
| Job fica IN_QUEUE | Workers crashando | Verificar logs com nível Info no RunPod |
