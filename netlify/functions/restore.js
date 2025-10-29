// netlify/functions/restore.js
// Calls Dzine "create_task_upscale" as a gentle restore/enhance,
// then polls "get_task_progress/{task_id}" for the result.
//
// Auth per Dzine docs: Authorization: {API_KEY}  (no Bearer)
// Base per docs: https://papi.dzine.ai/openapi/v1/...  (note "papi").
// Poll up to ~25s to fit Netlify 30s limit.

const DZINE_BASE = 'https://papi.dzine.ai/openapi/v1';
const API_KEY = process.env.DZINE_API_KEY;

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type,authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

async function postJson(path, body, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${DZINE_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Dzine expects the API key directly in Authorization header:
        // Authorization: {API_KEY}
        // (not "Bearer <key>")
        'Authorization': API_KEY,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(t);
  }
}

async function pollProgress(taskId, timeoutMs = 25000, intervalMs = 1200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = `${DZINE_BASE}/get_task_progress/${encodeURIComponent(taskId)}`;
    const res = await fetch(url, { headers: { 'Authorization': API_KEY } });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }

    // Dzine returns: { code, msg, data: { status, generate_result_slots: [...] } }
    const status = json?.data?.status;
    if (status === 'succeeded' || status === 'success' || status === 'completed' || status === 'done') {
      // First non-empty slot is the image URL
      const slots = json?.data?.generate_result_slots || [];
      const first = Array.isArray(slots) ? slots.find(Boolean) : null;
      return { ok: true, url: first || null, raw: json };
    }
    if (status === 'failed' || status === 'error') {
      return { ok: false, error: `Dzine job failed: ${text}` };
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return { ok: false, error: 'Dzine polling timed out' };
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: cors() });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: cors() });
  }
  try {
    const { image_url, options = {} } = await req.json();
    if (!API_KEY) return new Response('Missing DZINE_API_KEY', { status: 500, headers: cors() });
    if (!image_url) return new Response('Missing image_url', { status: 400, headers: cors() });

    // Use Dzine Upscale as a visible "restore" (2x by default, jpg output)
    const upFactor = Number(options.upscale) || 2; // 1.5, 2, 3, 4 allowed
    const body = {
      upscaling_resize: upFactor,
      output_format: 'jpg',
      images: [{ url: image_url }], // Dzine supports URL images directly
    };

    // 1) Create task
    const first = await postJson('/create_task_upscale', body, 12000);  // quick call
    if (!first.ok) {
      return new Response(`Dzine restore error (${first.status}): ${first.text}`, { status: 502, headers: cors() });
    }
    const taskId = first?.json?.data?.task_id;
    if (!taskId) {
      return new Response(`Dzine restore: no task_id. Raw: ${first.text}`, { status: 502, headers: cors() });
    }

    // 2) Poll progress until done (≤ ~25s)
    const polled = await pollProgress(taskId, 25000, 1200);
    if (!polled.ok || !polled.url) {
      const msg = polled.error || 'No URL in Dzine result';
      return new Response(`Dzine restore job error: ${msg}`, { status: 502, headers: cors() });
    }

    // Success
    return new Response(JSON.stringify({ processed_url: polled.url, dzine_task_id: taskId }), {
      status: 200,
      headers: { ...cors(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err?.name === 'AbortError' ? 'Dzine request timed out' : err.message;
    return new Response(`Server error: ${msg}`, { status: 500, headers: cors() });
  }
};
