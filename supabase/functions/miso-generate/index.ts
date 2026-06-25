const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const RUNPOD_API_KEY  = Deno.env.get('RUNPOD_API_KEY');
  const RUNPOD_ENDPOINT = Deno.env.get('RUNPOD_MISO_ENDPOINT_ID');

  if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT) {
    return json({ error: 'RUNPOD_API_KEY ou RUNPOD_MISO_ENDPOINT_ID não configurados' }, 500);
  }

  try {
    const body = await req.json();
    const { text, speaker, temperature, topk, max_audio_length_ms, context } = body;

    if (!text) return json({ error: 'text obrigatório' }, 400);

    const res = await fetch(`https://api.runpod.io/v2/${RUNPOD_ENDPOINT}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RUNPOD_API_KEY}`,
      },
      body: JSON.stringify({
        input: {
          text,
          speaker:             speaker             ?? 0,
          temperature:         temperature         ?? 0.4,
          topk:                topk               ?? 15,
          max_audio_length_ms: max_audio_length_ms ?? 90000,
          context:             context             ?? [],
        },
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return json({ error: `RunPod ${res.status}: ${txt}` }, 502);
    }

    const data = await res.json() as { id: string; status: string };
    return json({ jobId: data.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro interno' }, 500);
  }
});
