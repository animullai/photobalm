// netlify/functions/restore.js
// Async Dzine flow: POST starts job (202 + task_id). GET ?task_id= polls status.
// Auth per Dzine docs: Authorization header is the API key itself (no "Bearer").
// Base: https://papi.dzine.ai/openapi/v1

const DZINE_BASE = 'https://papi.dzine.ai/openapi/v1';
const API_KEY = process.env.DZINE_API_KEY;

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type,authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

function firstUrlFromProgress(json) {
  // Expected: { data: { generate_result_slots: [ "https://...webp", ... ] } }
  const slots = json?.data?.generate_result_slots;
  if (Array.isArray(slots)) {
    const first = slots.find(s => typeof s === 'string' && s.length > 0);
    if (first) return first;
  }
  // Fallbacks if Dzine changes shape:
  const maybe = json?.data?.url || json?.data?.result_url || json?.processed_url;
  return (typeof maybe === 'string' && maybe) ? maybe : null;
}

function isDoneStatus(s) {
  // Dzine returns "succeed" for done; handle all likely variants.
  const v = String(s || '').toLowerCase();
  return v === 'succeed' || v === 'succeeded' || v === 'success' || v === 'completed' || v === 'done';
}

async function dzinePost(path, body) {
  const res = await fetch(`${DZINE_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': API_KEY },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json, text };
}

async function dzineProgress(taskId) {
  const url = `${DZINE_BASE}/get_task_progress/${encodeURIComponent(taskId)}`;
  const res = await fetch(url, { headers: { 'Authorization': API_KEY } });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  const status = json?.data?.status || json?.status;
  if (isDoneStatus(status)) {
    const urlOut = firstUrlFromProgress(json);
    return { done: true, url: urlOut, raw: json };
  }
  if (String(status || '').toLowerCase() === 'failed' || String(status || '').toLowerCase() === 'error') {
    return { done: true, error: `Dzine job failed: ${text}` };
  }
  return { done: false, status: status || 'processing', raw: json };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: cors() });

  // GET: status poll
  const u = new URL(req.url);
  const taskIdParam = u.searchParams.get('task_id');
  if (req.method === 'GET' && taskIdParam) {
    try {
      const prog = await dzineProgress(taskIdParam);
      if (prog.done && prog.url) {
        return new Response(JSON.stringify({ processed_url: prog.url, task_id: taskIdParam, status: 'succeed' }), {
          status: 200, headers: { ...cors(), 'Content-Type': 'application/json' },
        });
      }
      if (prog.done && prog.error) {
        return new Response(prog.error, { status: 502, headers: cors() });
      }
      return new Response(JSON.stringify({ task_id: taskIdParam, status: prog.status || 'processing' }), {
        status: 200, headers: { ...cors(), 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(`Status error: ${e.message}`, { status: 500, headers: cors() });
    }
  }

  // POST: start job
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors() });
  try {
    if (!API_KEY) return new Response('Missing DZINE_API_KEY', { status: 500, headers: cors() });

    const { image_url, options = {} } = await req.json();
    if (!image_url) return new Response('Missing image_url', { status: 400, headers: cors() });

    // Use Dzine upscale as restoration path (visible improvement + URL output)
    const scale = Number(options.upscale) || 2; // 1.5, 2, 3, 4
    const body = { upscaling_resize: scale, output_format: 'jpg', images: [{ url: image_url }] };

    const first = await dzinePost('/create_task_upscale', body);
    if (!first.ok) {
      return new Response(`Dzine create error (${first.status}): ${first.text}`, { status: 502, headers: cors() });
    }
    const taskId = first?.json?.data?.task_id;
    if (!taskId) {
      return new Response(`Dzine create: no task_id. Raw: ${first.text}`, { status: 502, headers: cors() });
    }

    // Hand task_id back so the browser can poll
    return new Response(JSON.stringify({ task_id: taskId, status: 'queued' }), {
      status: 202, headers: { ...cors(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(`Server error: ${err.message}`, { status: 500, headers: cors() });
  }
};
