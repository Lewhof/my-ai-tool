import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const sources = {
  square: await readFile(join(publicDir, 'icon.svg')),
};

const outputs = [
  { name: 'icon-192.png', size: 192, source: 'square' },
  { name: 'icon-512.png', size: 512, source: 'square' },
  { name: 'apple-touch-icon.png', size: 180, source: 'square' },
  { name: 'favicon-32.png', size: 32, source: 'square' },
  { name: 'favicon-16.png', size: 16, source: 'square' },
];

for (const out of outputs) {
  await sharp(sources[out.source])
    .resize(out.size, out.size)
    .png()
    .toFile(join(publicDir, out.name));
  console.log(`✓ ${out.name} (${out.size}×${out.size})`);
}

console.log('\nDone. Regenerate anytime with: node scripts/generate-icons.mjs');
