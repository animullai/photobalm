// netlify/functions/restore.js
// Restore via Dzine Img2Img (neutral "No Style" if available)
// Input:  { image_url, options? }
// Output: { processed_url }

const { CORS, getJson, postJson, ensureOkDzine, pollProgress, firstResultUrl } = require('./_dzine_openapi');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: 'ok' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  try {
    const { image_url, options = {} } = JSON.parse(event.body || '{}');
    if (!image_url) return bad(400, 'Missing image_url');

    // 1) Load styles → prefer "No Style" to keep look neutral
    const stylesRaw = await getJson('/style/list');
    const stylesCheck = ensureOkDzine(stylesRaw, 'Style list');
    if (!stylesCheck.ok) return bad(stylesRaw.status || 502, stylesCheck.message);
    const list = stylesRaw.json?.data?.list || [];
    const noStyle = list.find(s => /no\s*style/i.test(s?.name || '')) || list[0];
    if (!noStyle?.style_code) return bad(502, 'Could not resolve Dzine style_code');

    // 2) Start img2img task
    const body = {
      prompt: options.prompt || 'Photo enhancement',
      style_code: noStyle.style_code,
      style_intensity: 0,         // neutral
      structure_match: 0.9,       // preserve content
      quality_mode: 1,            // high quality
      color_match: 1,             // preserve tones
      generate_slots: [1,0,0,0],  // one output
      images: [{ url: image_url }],
      output_format: 'webp'
    };

    const startRaw = await postJson('/create_task_img2img', body);
    const startCheck = ensureOkDzine(startRaw, 'Img2Img create');
    if (!startCheck.ok) return bad(startRaw.status || 502, startCheck.message);

    const taskId = startRaw.json?.data?.task_id;
    if (!taskId) return bad(502, `Img2Img create: no task_id (raw: ${startRaw.text || 'empty'})`);

    // 3) Poll to completion (up to ~3 min)
    const done = await pollProgress(taskId, { label: 'Img2Img progress' });
    if (!done.ok) return bad(done.status || 502, done.message);

    const url = firstResultUrl(done.json);
    if (!url) return bad(502, `Img2Img succeeded but no result URL (raw: ${JSON.stringify(done.json)})`);

    return ok({ processed_url: url, dzine_task_id: taskId });
  } catch (e) {
    return bad(500, `Server error: ${e.message}`);
  }

  function ok(obj)  { return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }; }
  function bad(c,m) { return { statusCode: c,   headers: CORS, body: m }; }
};
