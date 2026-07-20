// Rasterise the Jungle mark into the PNG sizes a PWA install needs.
//
// Run with `npm run icons` after changing public/favicon.svg. The committed PNGs
// are what ship; this script never runs in CI or during `npm run build`.
// sharp is therefore an OPTIONAL dependency — it pulls a platform-specific
// native binary, and a install failure on some CI runner must not be able to
// block a deploy for a tool the deploy does not use.
//
// Two shapes are produced:
//   any      — the mark as drawn, rounded corners and all
//   maskable — the same mark inset inside a full-bleed background, because
//              Android crops maskable icons to a circle/squircle and would
//              otherwise clip the barbell plates off the edges.
import sharp from "sharp";
import fs from "node:fs";

const SVG = fs.readFileSync(new URL("../public/favicon.svg", import.meta.url));
const OUT = new URL("../public/", import.meta.url);

const write = async (name, buf) => {
  fs.writeFileSync(new URL(name, OUT), buf);
  console.log(`${name}  ${(buf.length / 1024).toFixed(1)} KB`);
};

for (const size of [192, 512]) {
  await write(`icon-${size}.png`, await sharp(SVG, { density: 384 }).resize(size, size).png().toBuffer());
}

// Maskable: 80% mark on a solid Canopy-background field, giving the ~10% safe
// margin the spec asks for on every side.
const inner = 512 * 0.8;
const markOnly = await sharp(SVG, { density: 384 }).resize(Math.round(inner), Math.round(inner)).png().toBuffer();
await write("icon-512-maskable.png", await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#0A0F0C" },
})
  .composite([{ input: markOnly, gravity: "centre" }])
  .png()
  .toBuffer());
