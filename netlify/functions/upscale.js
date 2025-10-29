// netlify/functions/upscale.js
// Upscale via Dzine Upscale
// Input:  { image_url, options:{ scale } }  // scale allowed: 1.5, 2, 3, 4
// Output: { processed_url }

const { CORS, postJson, ensureOkDzine, pollProgress, firstResultUrl } = require('./_dzine_openapi');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: 'ok' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  try {
    const { image_url, options = {} } = JSON.parse(event.body || '{}');
    if (!image_url) return bad(400, 'Missing image_url');

    const scale = Number.parseFloat(options.scale) || 2; // Dzine supports 1.5,2,3,4
    const body = {
      upscaling_resize: scale,
      output_format: 'jpg',
      images: [{ url: image_url }]
    };

    const startRaw = await postJson('/create_task_upscale', body);
    const startCheck = ensureOkDzine(startRaw, 'Upscale create');
    if (!startCheck.ok) return bad(startRaw.status || 502, startCheck.message);

    const taskId = startRaw.json?.data?.task_id;
    if (!taskId) return bad(502, `Upscale create: no task_id (raw: ${startRaw.text || 'empty'})`);

    const done = await pollProgress(taskId, { label: 'Upscale progress' });
    if (!done.ok) return bad(done.status || 502, done.message);

    const url = firstResultUrl(done.json);
    if (!url) return bad(502, `Upscale succeeded but no result URL (raw: ${JSON.stringify(done.json)})`);

    return ok({ processed_url: url, dzine_task_id: taskId });
  } catch (e) {
    return bad(500, `Server error: ${e.message}`);
  }

  function ok(obj)  { return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }; }
  function bad(c,m) { return { statusCode: c,   headers: CORS, body: m }; }
};
