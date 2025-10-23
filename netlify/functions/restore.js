// netlify/functions/restore.js
const { parsePublicId, buildBasicAuthHeader } = require('./_cldy');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: 'ok' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  try {
    const { image_url, options = {} } = JSON.parse(event.body || '{}');
    if (!image_url) return { statusCode: 400, headers: CORS, body: 'Missing image_url' };
    if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
      console.error('[restore] Missing env', { CLOUD_NAME: !!CLOUD_NAME, API_KEY: !!API_KEY, API_SECRET: !!API_SECRET });
      return { statusCode: 500, headers: CORS, body: 'Cloudinary credentials not configured' };
    }

    const publicId = parsePublicId(image_url);
    console.log('[restore] image_url:', image_url);
    console.log('[restore] publicId:', publicId);

    if (!publicId) {
      console.warn('[restore] Non-Cloudinary URL, echoing back.');
      return ok({ processed_url: image_url, note: 'non-cloudinary-url' });
    }

    const subtle = options.style === 'subtle';
    const recipe = [
      'e_improve',
      subtle ? 'e_unsharp_mask:40' : 'e_unsharp_mask:120',
      !subtle ? 'e_contrast:30' : '',
      options.enhanceFaces ? 'e_enhance:faces' : '',
      'q_auto:best',
      'f_auto',
    ].filter(Boolean).join(',');

    const body = new URLSearchParams({ public_id: publicId, type: 'upload', eager: recipe });

    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/explicit`;
    console.log('[restore] POST', url, 'recipe:', recipe);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': buildBasicAuthHeader(API_KEY, API_SECRET),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const text = await res.text();
    if (!res.ok) {
      console.error('[restore] Cloudinary explicit error', res.status, text);
      return { statusCode: 502, headers: CORS, body: `Cloudinary explicit error (${res.status}): ${text}` };
    }

    let json;
    try { json = JSON.parse(text); } catch { json = {}; }
    const processed_url = json?.eager?.[0]?.secure_url || image_url;
    console.log('[restore] processed_url:', processed_url);

    return ok({ processed_url });
  } catch (err) {
    console.error('[restore] Server error', err);
    return { statusCode: 500, headers: CORS, body: `Server error: ${err.message}` };
  }

  function ok(obj) {
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
  }
};
