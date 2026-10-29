// Run with the bundled Node runtime; NODE_PATH may point at its bundled packages.
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
(async () => {
  const svg = await fs.readFile(path.join(__dirname, "icon.svg"));
  for (const size of [16, 32, 48, 128, 512]) {
    await sharp(svg, { density: 384 }).resize(size, size).png().toFile(path.join(__dirname, size === 512 ? "icon-master.png" : `icon${size}.png`));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
