// netlify/functions/restore.js
export async function handler(event) {
  try {
    if (event.httpMethod !== "POST")
      return { statusCode: 405, body: "Method Not Allowed" };

    // forward the uploaded image to Dzine.ai
    const dzineEndpoint = "https://api.dzine.ai/v1/portrait/restore";

    const res = await fetch(dzineEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DZINE_API_KEY}`,
        "Content-Type": "application/octet-stream",
      },
      body: Buffer.from(event.body, "base64"),
    });

    if (!res.ok) {
      const txt = await res.text();
      return { statusCode: res.status, body: txt };
    }

    const arrayBuf = await res.arrayBuffer();
    return {
      statusCode: 200,
      headers: { "Content-Type": res.headers.get("content-type") || "image/jpeg" },
      body: Buffer.from(arrayBuf).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 500, body: "Server error" };
  }
}
