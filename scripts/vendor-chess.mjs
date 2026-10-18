import { readFile, copyFile, mkdir } from 'node:fs/promises';

const files = [
  ['node_modules/chess.js/dist/esm/chess.js', 'vendor/chess.js'],
  ['node_modules/chess.js/LICENSE', 'vendor/chess.LICENSE'],
];
await mkdir('vendor', { recursive: true });
for (const [source, target] of files) {
  if (process.argv.includes('--check')) {
    const [installed, bundled] = await Promise.all([readFile(source), readFile(target)]);
    if (!installed.equals(bundled)) throw new Error(`${target} differs from the locked dependency. Run npm run vendor:chess.`);
  } else {
    await copyFile(source, target);
  }
}
console.log('✓ Local chess.js and license match the locked dependency.');
