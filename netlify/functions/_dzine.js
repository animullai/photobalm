// netlify/functions/_dzine.js
const BASE = process.env.DZINE_BASE_URL || 'https://api.dzine.ai';
const RESTORE_PATH = process.env.DZINE_RESTORE_PATH || '/v1/restore';
const UPSCALE_PATH = process.env.DZINE_UPSCALE_PATH || '/v1/upscale';
const API_KEY = process.env.DZINE_API_KEY;

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type,authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function bearer() {
  if (!API_KEY) throw new Error('Missing DZINE_API_KEY env var');
  return { Authorization: `Bearer ${API_KEY}` };
}

async function postJson(path, body) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...bearer() },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json, text, url };
}

// Generic job poller if Dzine returns { job_id } or { id, status }
async function pollJob(jobUrl, { maxMs = 25000, intervalMs = 1200 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const res = await fetch(jobUrl, { headers: { ...bearer() } });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }

    // Try common shapes; adjust if Dzine differs
    const status = json.status || json.state;
    const result = json.result || json.output || json.data;

    if (status === 'succeeded' || status === 'completed' || status === 'done') {
      return { ok: true, json, text };
    }
    if (status === 'failed' || status === 'error') {
      return { ok: false, json, text };
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }
  return { ok: false, json: { error: { message: 'Polling timeout' } }, text: 'timeout' };
}

module.exports = {
  BASE, RESTORE_PATH, UPSCALE_PATH, cors, postJson, pollJob
};
