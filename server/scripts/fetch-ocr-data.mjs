#!/usr/bin/env node
/**
 * Downloads the tesseract English language data used by the passport OCR into server/ocr
 * (or TESSERACT_LANG_PATH). Run once per deployment; the API never downloads anything at runtime.
 *
 *   node scripts/fetch-ocr-data.mjs            # from server/
 *   TESSERACT_LANG_PATH=/srv/ocr node scripts/fetch-ocr-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.env.TESSERACT_LANG_PATH ? path.resolve(process.env.TESSERACT_LANG_PATH) : path.join(serverRoot, 'ocr');
const target = path.join(dir, 'eng.traineddata.gz');

// Same data tesseract.js would fetch by itself (LSTM "best" integer model, ~3 MB gzipped), with the
// tessdata GitHub mirror as a fallback.
const SOURCES = [
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
  'https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_best_int/eng.traineddata.gz',
];

const main = async () => {
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(target) || fs.existsSync(path.join(dir, 'eng.traineddata'))) {
    console.log(`OCR data already present in ${dir}`);
    return;
  }
  let lastError;
  for (const url of SOURCES) {
    try {
      console.log(`Downloading ${url} …`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length < 1_000_000 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error('unexpected content (not a gzip file)');
      fs.writeFileSync(`${target}.part`, bytes);
      fs.renameSync(`${target}.part`, target);
      console.log(`Saved ${(bytes.length / 1024 / 1024).toFixed(1)} MB to ${target}`);
      return;
    } catch (err) {
      lastError = err;
      console.warn(`  failed: ${err.message}`);
    }
  }
  console.error('Could not download the OCR language data. Place eng.traineddata(.gz) manually into', dir);
  console.error(String(lastError));
  process.exit(1);
};

main();
