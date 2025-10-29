// netlify/functions/upscale.js
// Uses Dzine Upscale. Contract: { image_url, options:{ scale } } -> { processed_url }

const { CORS, postJson, pollProgress, firstResultUrl } = require('./_dzine_openapi');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: 'ok' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  try {
    const { image_url, options = {} } = JSON.parse(event.body || '{}');
    if (!image_url) return bad(400, 'Missing image_url');

    const scale = Number.parseFloat(options.scale) || 2; // Dzine allows 1.5, 2, 3, 4
    const body = {
      upscaling_resize: scale,
      output_format: 'jpg',
      images: [{ url: image_url }]
    };

    const start = await postJson('/create_task_upscale', body);
    if (!start.ok) return bad(start.status || 502, `Dzine upscale error: ${start.text}`);

    const taskId = start.json?.data?.task_id;
    if (!taskId) return bad(502, `Dzine upscale: no task_id. Raw: ${start.text}`);

    const done = await pollProgress(taskId);
    if (!done.ok) {
      const dzineMsg = done?.json?.error?.message || done.text || 'unknown';
      return bad(done.status || 502, `Dzine upscale job failed: ${dzineMsg}`);
    }

    const url = firstResultUrl(done.json);
    if (!url) return bad(502, `Dzine upscale succeeded but no result URL. Raw: ${JSON.stringify(done.json)}`);

    return ok({ processed_url: url, dzine_task_id: taskId });
  } catch (e) {
    return bad(500, `Server error: ${e.message}`);
  }

  function ok(obj)  { return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }; }
  function bad(c,m) { return { statusCode: c,   headers: CORS, body: m }; }
};
