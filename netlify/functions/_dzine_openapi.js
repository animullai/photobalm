// netlify/functions/_dzine_openapi.js
// Dzine OpenAPI helper: GET/POST + progress polling with clear errors

const BASE = 'https://papi.dzine.ai/openapi/v1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function authHeader() {
  const key = process.env.DZINE_API_KEY;
  if (!key) throw new Error('Missing DZINE_API_KEY');
  // Dzine expects: Authorization: {API_KEY}  (no "Bearer")
  return { Authorization: key };
}

// Helper to normalize Dzine responses (they use {code, msg, data})
function ensureOkDzine({ ok, status, json, text }, label) {
  if (!ok) {
    return { ok: false, status, message: `${label} HTTP ${status}: ${text || 'no body'}` };
  }
  const code = json?.code;
  if (code !== 200) {
    const msg = json?.msg || 'Unknown Dzine error';
    return { ok: false, status: 200, message: `${label} Dzine code ${code}: ${msg}` };
  }
  return { ok: true, json, text };
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeader() },
  });
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

// Poll Dzine job/state until finished (up to 3 minutes)
async function pollProgress(taskId, { maxMs = 180000, intervalMs = 1500, label = 'Dzine progress' } = {}) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const r = await getJson(`/get_task_progress/${encodeURIComponent(taskId)}`);
    const check = ensureOkDzine(r, label);
    if (!check.ok) return { ok: false, status: r.status, message: check.message, json: r.json, text: r.text };

    const st = String(r.json?.data?.status || '').toLowerCase();
    // Dzine statuses: waiting / in_queue / processing / uploading / succeeded / failed
    if (st === 'succeeded' || st === 'success') return { ok: true, status: 200, json: r.json, text: r.text };
    if (st === 'failed'   || st === 'error')   return { ok: false, status: 502, message: `${label} failed`, json: r.json, text: r.text };

    await new Promise(r => setTimeout(r, intervalMs));
  }
  return { ok: false, status: 504, message: 'Polling timeout (client limit)', json: null, text: 'timeout' };
}

function firstResultUrl(progressJson) {
  const slots = progressJson?.data?.generate_result_slots;
  if (Array.isArray(slots)) {
    const found = slots.find(u => typeof u === 'string' && u.length > 0);
    if (found) return found;
  }
  return null;
}

module.exports = { CORS, getJson, postJson, ensureOkDzine, pollProgress, firstResultUrl };
