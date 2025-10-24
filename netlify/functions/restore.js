const { cors, postJson, pollJob, BASE, RESTORE_PATH } = require('./_dzine');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: 'ok' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: cors(), body: 'Method Not Allowed' };

  try {
    const { image_url, options = {} } = JSON.parse(event.body || '{}');
    if (!image_url) return { statusCode: 400, headers: cors(), body: 'Missing image_url' };

    // Send to Dzine.ai — adjust keys to match your Dzine API exactly if different
    const payload = { image_url, options };
    const first = await postJson(RESTORE_PATH, payload);

    // CASE A: Sync success with result URL
    const directUrl = first.json?.processed_url || first.json?.result_url || first.json?.url;
    if (first.ok && directUrl) {
      return ok({ processed_url: directUrl, dzine_endpoint: `${BASE}${RESTORE_PATH}` });
    }

    // CASE B: Async job — poll until ready
    const jobId = first.json?.job_id || first.json?.id;
    const jobUrl = first.json?.job_url || (jobId ? `${BASE}/v1/jobs/${jobId}` : null);

    if (!first.ok && !jobUrl) {
      return err(first.status, `Dzine restore error: ${first.text}`);
    }
    if (!jobUrl) {
      return err(502, `Dzine restore: no result URL or job to poll. Raw: ${first.text}`);
    }

    const polled = await pollJob(jobUrl);
    if (!polled.ok) {
      return err(502, `Dzine restore job failed: ${polled.text}`);
    }

    const finalUrl = polled.json?.processed_url || polled.json?.result_url || polled.json?.url;
    if (!finalUrl) {
      return err(502, `Dzine restore job succeeded but no URL found. Raw: ${JSON.stringify(polled.json)}`);
    }

    return ok({ processed_url: finalUrl, dzine_job_url: jobUrl });

  } catch (e) {
    return err(500, `Server error: ${e.message}`);
  }

  function ok(obj) {
    return { statusCode: 200, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
  }
  function err(code, message) {
    return { statusCode: code, headers: cors(), body: message };
  }
};
