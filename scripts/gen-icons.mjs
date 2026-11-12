/* Generates PWA PNG icons from public/icon.svg.
   Run: node scripts/gen-icons.mjs  (dev-only; outputs to public/) */
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const svg = await readFile("public/icon.svg", "utf8");
/* full-bleed variant for maskable + apple-touch-icon (no rounded corners) */
const fullBleed = Buffer.from(svg.replace('rx="80"', 'rx="0"'));

/* plain icons (rounded-rect art as designed) */
await sharp(Buffer.from(svg), { density: 300 }).resize(192, 192).png().toFile("public/icon-192.png");
await sharp(Buffer.from(svg), { density: 300 }).resize(512, 512).png().toFile("public/icon-512.png");

/* maskable: art scaled into the safe zone on a full-bleed background */
const art = await sharp(fullBleed, { density: 300 }).resize(410, 410).png().toBuffer();
const maskable512 = await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#0a0a0a" },
})
  .composite([{ input: art, gravity: "center" }])
  .png()
  .toBuffer();
await sharp(maskable512).resize(192, 192).png().toFile("public/icon-maskable-192.png");
await sharp(maskable512).toFile("public/icon-maskable-512.png");

/* iOS home-screen icon (full-bleed; iOS applies its own rounding) */
await sharp(fullBleed, { density: 300 }).resize(180, 180).png().toFile("public/apple-touch-icon.png");

console.log("icons generated");
