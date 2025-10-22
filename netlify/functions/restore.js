// netlify/functions/restore.js
exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Preflight for browsers
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: 'ok' };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };
  }

  try {
    // Expect JSON: { image_url, options }
    const payload = JSON.parse(event.body || '{}');
    const imageUrl = payload.image_url;

    if (!imageUrl || typeof imageUrl !== 'string') {
      return {
        statusCode: 400,
        headers: cors,
        body: 'Missing or invalid "image_url"',
      };
    }

    // TODO: Call your real restore pipeline here.
    // For verification we simply echo the input URL.
    const processed_url = imageUrl;

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        processed_url,
        ok: true,
        // echo back options for debug visibility in the UI log
        debug: { options: payload.options || null },
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: cors,
      body: `Server error: ${err.message}`,
    };
  }
};
