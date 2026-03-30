import fs from 'node:fs';
import path from 'node:path';

const srcDir = path.resolve('src/assets');
const outDir = path.resolve('dist/assets');

if (fs.existsSync(srcDir)) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir)) {
    fs.copyFileSync(path.join(srcDir, entry), path.join(outDir, entry));
  }
}