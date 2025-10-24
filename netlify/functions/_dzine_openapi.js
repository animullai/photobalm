// netlify/functions/_dzine_openapi.js
const BASE = 'https://papi.dzine.ai/openapi/v1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function authHeader() {
  const key = process.env.DZINE_API_KEY;
  if (!key) throw new Error('Missing DZINE_API_KEY');
  // Dzine wants Authorization: {API_KEY}  (no "Bearer")
  return { Authorization: key };
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...authHeader() } });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json, text };
}

async function postJson(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json, text };
}

async function pollProgress(taskId, { maxMs = 30000, intervalMs = 1200 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const { ok, status, json, text } = await getJson(`/get_task_progress/${encodeURIComponent(taskId)}`);
    if (!ok) return { ok, status, json, text };
    const st = json?.data?.status;
    if (st === 'succeeded' || st === 'success') return { ok: true, status, json, text };
    if (st === 'failed' || st === 'error') return { ok: false, status, json, text };
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return { ok: false, status: 504, json: { error: { message: 'Polling timeout' } }, text: 'timeout' };
}

function firstResultUrl(progressJson) {
  const slots = progressJson?.data?.generate_result_slots;
  if (Array.isArray(slots)) {
    const found = slots.find(u => typeof u === 'string' && u.length > 0);
    if (found) return found;
  }
  return null;
}

module.exports = { BASE, CORS, getJson, postJson, pollProgress, firstResultUrl };
