// netlify/functions/_cldy.js
// Shared helpers for restore.js / upscale.js

const crypto = require('crypto');

// Extract Cloudinary public_id from a full URL
// e.g. https://res.cloudinary.com/<cloud>/image/upload/v123/folder/photo.jpg -> "folder/photo"
exports.parsePublicId = function parsePublicId(cloudinaryUrl) {
  const marker = '/image/upload/';
  const i = cloudinaryUrl.indexOf(marker);
  if (i === -1) return null;
  let tail = cloudinaryUrl.slice(i + marker.length);   // v123/folder/photo.jpg
  tail = tail.replace(/^v\d+\//, '');                  // folder/photo.jpg
  const dot = tail.lastIndexOf('.');
  return dot !== -1 ? tail.slice(0, dot) : tail;       // folder/photo
};

// Build Upload API signature: SHA1 of sorted params + API_SECRET
exports.buildSignature = function buildSignature(params, apiSecret) {
  // Build string of non-empty params sorted by key, like: eager=...&public_id=...&timestamp=...&type=upload
  const kv = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  return crypto.createHash('sha1').update(kv + apiSecret).digest('hex');
};
