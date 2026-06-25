const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const SUPABASE_URL  = 'https://xwjipmmcnnhxjfbolhjs.supabase.co';
const SUPABASE_ANON = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

async function uploadWav(b64: string, jobId: string): Promise<string> {
  const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const path   = `miso-${jobId}.wav`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/uploads/${path}`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON}`,
      'apikey':        SUPABASE_ANON,
      'Content-Type':  'audio/wav',
    },
    body: binary,
  });
  if (!res.ok) throw new Error(`Storage upload failed: ${res.status}`);
  return `${SUPABASE_URL}/storage/v1/object/public/uploads/${path}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const RUNPOD_API_KEY  = Deno.env.get('RUNPOD_API_KEY');
  const RUNPOD_ENDPOINT = Deno.env.get('RUNPOD_MISO_ENDPOINT_ID');

  if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT) {
    return json({ error: 'RUNPOD_API_KEY ou RUNPOD_MISO_ENDPOINT_ID não configurados' }, 500);
  }

  const url   = new URL(req.url);
  const jobId = url.searchParams.get('jobId')
    ?? await req.json().then((b: { jobId?: string }) => b.jobId).catch(() => null);

  if (!jobId) return json({ error: 'jobId obrigatório' }, 400);

  try {
    const res = await fetch(`https://api.runpod.io/v2/${RUNPOD_ENDPOINT}/status/${jobId}`, {
      headers: { 'Authorization': `Bearer ${RUNPOD_API_KEY}` },
    });
    if (!res.ok) return json({ error: `RunPod ${res.status}` }, 502);

    const data = await res.json() as {
      id: string;
      status: string;
      output?: { audio_base64?: string; error?: string };
      error?:  string;
    };

    if (data.status === 'COMPLETED') {
      if (data.output?.error) return json({ status: 'failed', error: data.output.error });

      const b64 = data.output?.audio_base64;
      if (!b64) return json({ status: 'failed', error: 'sem áudio no output' });

      const outputUrl = await uploadWav(b64, jobId);
      return json({ status: 'completed', outputUrl });
    }

    if (data.status === 'FAILED') {
      return json({ status: 'failed', error: data.error ?? 'RunPod reportou falha' });
    }

    return json({ status: 'pending' });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro interno' }, 500);
  }
});
