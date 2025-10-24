// netlify/functions/_cldy.js
// Shared helpers for restore.js / upscale.js

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

// Build Basic auth header for Cloudinary API
exports.buildBasicAuthHeader = function buildBasicAuthHeader(key, secret) {
  const token = Buffer.from(`${key}:${secret}`).toString('base64');
  return `Basic ${token}`;
};
