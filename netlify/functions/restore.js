// netlify/functions/restore.js
const { CORS, getJson, postJson, pollProgress, firstResultUrl } = require('./_dzine_openapi');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: 'ok' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  try {
    const { image_url, options = {} } = JSON.parse(event.body || '{}');
    if (!image_url) return bad(400, 'Missing image_url');

    // 1) Fetch style list and pick a "No Style" variant (safe, neutral)
    const styles = await getJson('/style/list');
    if (!styles.ok) return bad(502, `Dzine style list error: ${styles.text}`);
    const list = styles.json?.data?.list || [];
    // Prefer names that include "No Style"; otherwise use first available
    const noStyle = list.find(s => /no\s*style/i.test(s?.name || '')) || list[0];
    if (!noStyle?.style_code) return bad(502, 'Could not resolve a style_code from Dzine styles.');

    // 2) Request img2img task
    const body = {
      prompt: options.prompt || 'Photo enhancement',
      style_code: noStyle.style_code,
      style_intensity: 0,             // neutral
      structure_match: 0.9,           // preserve content
      quality_mode: 1,                // high quality
      color_match: 1,                 // keep original tones
      generate_slots: [1,0,0,0],      // 1 output
      images: [{ url: image_url }],
      output_format: 'webp'
    };
    const start = await postJson('/create_task_img2img', body);
    if (!start.ok) return bad(start.status || 502, `Dzine img2img error: ${start.text}`);

    const taskId = start.json?.data?.task_id;
    if (!taskId) return bad(502, `Dzine img2img: no task_id. Raw: ${start.text}`);

    // 3) Poll progress to completion
    const done = await pollProgress(taskId);
    if (!done.ok) return bad(done.status || 502, `Dzine img2img job failed: ${done.text}`);

    const url = firstResultUrl(done.json);
    if (!url) return bad(502, `Dzine img2img succeeded but no result URL. Raw: ${JSON.stringify(done.json)}`);

    return ok({ processed_url: url, dzine_task_id: taskId });
  } catch (e) {
    return bad(500, `Server error: ${e.message}`);
  }

  function ok(obj)  { return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }; }
  function bad(c,m) { return { statusCode: c,   headers: CORS, body: m }; }
};
