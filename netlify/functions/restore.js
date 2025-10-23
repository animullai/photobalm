// netlify/functions/restore.js
// Turns the Cloudinary URL you uploaded into a *processed* URL by
// applying Cloudinary transformations (auto-enhance, de-scratch-ish,
// contrast, sharpen). No external API required.

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

    // Expect a Cloudinary URL like:
    // https://res.cloudinary.com/<cloud>/image/upload/v123/abc/def.jpg
    // We insert our transformation string right after "/upload/"
    const uploadMarker = '/image/upload/';
    const ix = image_url.indexOf(uploadMarker);
    if (ix === -1) {
      // Not a Cloudinary upload URL — just return original for safety
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ processed_url: image_url, note: 'non-cloudinary-url' }),
      };
    }

    // Choose a strength based on UI options
    const subtle = options.style === 'subtle';
    const sharpen = subtle ? 'e_unsharp_mask:40' : 'e_unsharp_mask:120';
    const improve = 'e_improve';           // auto enhance exposure/contrast/white balance
    const dehaze  = subtle ? '' : 'e_contrast:30'; // a gentle boost to punch midtones
    const faces   = options.enhanceFaces ? 'e_enhance:faces' : ''; // face-targeted enhance (Cloudinary auto-enchance respects faces)

    // Build transformation parts, filter out empties, then join with commas
    const txParts = [improve, dehaze, sharpen, faces, 'q_auto:best', 'f_auto'];
    const transformation = txParts.filter(Boolean).join(',');

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
