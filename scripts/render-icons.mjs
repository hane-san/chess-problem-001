// Rasterises assets/icon.svg for home screens. iOS rounds the corners itself, so
// the PNGs are full-bleed squares instead of keeping the SVG's transparent corners.
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const sizes = [['assets/apple-touch-icon.png', 180], ['assets/icon-192.png', 192], ['assets/icon-512.png', 512]];
const svg = (await readFile('assets/icon.svg', 'utf8')).replace(/ rx="[^"]*"/, '');
const browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {});
try {
  for (const [file, size] of sizes) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0;background:#111a17}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await writeFile(file, await page.screenshot({ type: 'png', omitBackground: false }));
    await page.close();
    console.log(`✓ ${file} ${size}×${size}`);
  }
} finally {
  await browser.close();
}
