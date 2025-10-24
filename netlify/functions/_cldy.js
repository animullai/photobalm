// netlify/functions/_cldy.js
// Shared helper used by restore.js and upscale.js

// Extract the public_id (Cloudinary’s internal name for the image)
// from a full Cloudinary URL.
// Example:
// https://res.cloudinary.com/drqxthmef/image/upload/v123456789/folder/photo.jpg
// returns "folder/photo"
exports.parsePublicId = function parsePublicId(cloudinaryUrl) {
  const marker = '/image/upload/';
  const i = cloudinaryUrl.indexOf(marker);
  if (i === -1) return null;

  // Remove the /image/upload/ part
  let tail = cloudinaryUrl.slice(i + marker.length);

  // Strip out version prefix (v12345/) if present
  tail = tail.replace(/^v\d+\//, '');

  // Remove file extension (.jpg, .png, etc.)
  const lastDot = tail.lastIndexOf('.');
  return lastDot !== -1 ? tail.slice(0, lastDot) : tail;
};

// Build the Basic Authorization header for Cloudinary API calls
// Combines your API key and secret into a secure Base64 string.
exports.buildBasicAuthHeader = function buildBasicAuthHeader(key, secret) {
  const token = Buffer.from(`${key}:${secret}`).toString('base64');
  return `Basic ${token}`;
};
