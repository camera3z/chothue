// Render the existing Rentbook SVG brand as a Windows bitmap ICO for NSIS.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'linux' ? { executablePath: '/usr/bin/chromium' } : {}),
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage(), images = [], sizes = [16, 32, 48, 256];
  for (const size of sizes) {
    const pixels = await page.evaluate(async ({ svg, size }) => {
      const image = new Image(); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, size, size);
      return Array.from(ctx.getImageData(0, 0, size, size).data);
    }, { svg, size });
    const maskStride = Math.ceil(size / 32) * 4;
    const data = Buffer.alloc(40 + size * size * 4 + maskStride * size);
    data.writeUInt32LE(40, 0); data.writeInt32LE(size, 4); data.writeInt32LE(size * 2, 8);
    data.writeUInt16LE(1, 12); data.writeUInt16LE(32, 14); data.writeUInt32LE(size * size * 4, 20);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const source = (y * size + x) * 4, target = 40 + ((size - y - 1) * size + x) * 4;
      data[target] = pixels[source + 2]; data[target + 1] = pixels[source + 1]; data[target + 2] = pixels[source]; data[target + 3] = pixels[source + 3];
      if (pixels[source + 3] === 0) data[40 + size * size * 4 + (size - y - 1) * maskStride + (x >> 3)] |= 128 >> (x % 8);
    }
    images.push(data);
  }
  const header = Buffer.alloc(6 + images.length * 16); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  for (let i = 0; i < images.length; i++) {
    const entry = 6 + i * 16; header[entry] = sizes[i] % 256; header[entry + 1] = sizes[i] % 256;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6); header.writeUInt32LE(images[i].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += images[i].length;
  }
  await mkdir(new URL('./assets/', import.meta.url), { recursive: true });
  await writeFile(new URL('./assets/rentbook.ico', import.meta.url), Buffer.concat([header, ...images]));
} finally { await browser.close(); }
