"use strict";
const OpenAI = require("openai");
const sharp  = require("sharp");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Génère un logo 1024×1024 via GPT Image 2 Standard ($0.011).
 * Retourne { url, b64 } — b64 est le buffer PNG en base64.
 */
async function generateLogo(prompt) {
  const response = await client.images.generate({
    model:   "gpt-image-1",        // gpt-image-1 = accès standard mai 2026
    prompt,
    n:       1,
    size:    "1024x1024",
    quality: "low",           // standard = $0.011 | high = $0.042
    output_format: "png",
  });

  const item = response.data[0];
  // L'API retourne b64_json ou url selon response_format
  if (item.b64_json) {
    return { url: null, b64: item.b64_json };
  }
  // Télécharger si on reçoit une URL
  const fetch = require("node-fetch");
  const res = await fetch(item.url);
  const buf = await res.buffer();
  return { url: item.url, b64: buf.toString("base64") };
}

/**
 * Redimensionne le logo PNG en base64 vers les 4 formats requis Google Play.
 * Retourne { "1024": Buffer, "512": Buffer, "192": Buffer, "48": Buffer }
 */
async function resizeLogo(b64) {
  const input = Buffer.from(b64, "base64");
  const sizes = [1024, 512, 192, 48];
  const result = {};

  for (const size of sizes) {
    result[String(size)] = await sharp(input)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }

  return result;
}

/**
 * Mock logo pour mode dev.
 */
function mockLogo(appName) {
  const initial = (appName || "A")[0].toUpperCase();
  // SVG minimaliste encodé en base64
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
    <rect fill="#7C3AED" width="1024" height="1024" rx="230"/>
    <text x="512" y="620" font-size="480" fill="white" text-anchor="middle"
          font-family="Arial, sans-serif" font-weight="800">${initial}</text>
  </svg>`;
  const b64 = Buffer.from(svg).toString("base64");
  return {
    logoUrl: `data:image/svg+xml;base64,${b64}`,
    formats: { "1024": b64, "512": b64, "192": b64, "48": b64 },
  };
}

module.exports = { generateLogo, resizeLogo, mockLogo };
