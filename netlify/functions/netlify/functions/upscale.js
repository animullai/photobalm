// netlify/functions/upscale.js
// Generates a transformed Cloudinary URL that "upscales" by targeting a larger width
// and adds sharpening. If we don't know the original size, we choose a sensible target.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: 'ok' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  try {
    const { image_url, options = {} } = JSON.parse(event.body || '{}');
    if (!image_url || typeof image_url !== 'string') {
      return { statusCode: 400, headers: CORS, body: 'Missing or invalid "image_url"' };
    }

    const uploadMarker = '/image/upload/';
    const ix = image_url.indexOf(uploadMarker);
    if (ix === -1) {
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ processed_url: image_url, note: 'non-cloudinary-url' }),
      };
    }

    // Requested scale factor (2,3,4). Default to 2 if missing.
    const scale = Number.parseInt(options.scale, 10) || 2;

    // Heuristic target width: if we don't know the original width,
    // aim for a typical print/share-friendly output.
    // You can tune these numbers later or pass actual image dimensions from the client.
    const targetWidth = scale >= 4 ? 2400 : scale === 3 ? 1800 : 1400;

    // e_upscale (if available on your plan) plus sharpen; fallback to scale+unsharp mask.
    // We’ll use: c_scale,w_<target>,e_unsharp_mask and general improvements.
    const txParts = [
      `c_scale,w_${targetWidth}`,
      'e_unsharp_mask:120',
      'e_improve',
      'q_auto:best',
      'f_auto'
    ];
    const transformation = txParts.join(',');

    const processed_url =
      image_url.slice(0, ix + uploadMarker.length) +
      transformation + '/' +
      image_url.slice(ix + uploadMarker.length);

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ processed_url }),
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: `Server error: ${err.message}` };
  }
};
