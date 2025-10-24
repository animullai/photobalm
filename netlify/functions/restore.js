// netlify/functions/restore.js
const { parsePublicId, buildSignature } = require('./_cldy');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY    = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

// Env sanity log (redacted)
console.log('[env]', {
  cloud: CLOUD_NAME,
  keyStart: API_KEY ? API_KEY.slice(0, 4) : null,
  keyLen: API_KEY ? API_KEY.length : 0
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: 'ok' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  try {
    const { image_url, options = {} } = JSON.parse(event.body || '{}');
    if (!image_url) return { statusCode: 400, headers: CORS, body: 'Missing image_url' };
    if (!CLOUD_NAME || !API_KEY || !API_SECRET)
      return { statusCode: 500, headers: CORS, body: 'Cloudinary credentials not configured' };

    const publicId = parsePublicId(image_url);
    if (!publicId) return ok({ processed_url: image_url, note: 'non-cloudinary-url' });

    const subtle  = options.style === 'subtle';
    const eager   = [
      'e_improve',
      subtle ? 'e_unsharp_mask:40' : 'e_unsharp_mask:120',
      !subtle ? 'e_contrast:30' : '',
      options.enhanceFaces ? 'e_enhance:faces' : '',
      'q_auto:best',
      'f_auto'
    ].filter(Boolean).join(',');

    // Required signed params
    const timestamp = Math.floor(Date.now() / 1000);
    const signedParams = {
      eager,
      public_id: publicId,
      timestamp,
      type: 'upload',
    };
    const signature = buildSignature(signedParams, API_SECRET);

    const form = new URLSearchParams({
      ...signedParams,
      api_key: API_KEY,
      signature,
    });

    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/explicit`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });

    const text = await res.text();
    if (!res.ok) {
      console.error('[restore] Cloudinary explicit error', res.status, text);
      return { statusCode: 502, headers: CORS, body: `Cloudinary explicit error (${res.status}): ${text}` };
    }

    let json; try { json = JSON.parse(text); } catch { json = {}; }
    const processed_url = json?.eager?.[0]?.secure_url || image_url;

    return ok({ processed_url });

  } catch (err) {
    console.error('[restore] Server error', err);
    return { statusCode: 500, headers: CORS, body: `Server error: ${err.message}` };
  }

  function ok(obj) {
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
  }
};
