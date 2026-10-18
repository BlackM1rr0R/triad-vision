#!/usr/bin/env node
/**
 * Downloads the tesseract language data into server/ocr (or TESSERACT_LANG_PATH): English is required
 * (passport OCR); Azerbaijani, German and Russian are optional extras used by the drive's full-text OCR.
 * Run once per deployment; the API never downloads anything at runtime.
 *
 *   node scripts/fetch-ocr-data.mjs            # from server/
 *   TESSERACT_LANG_PATH=/srv/ocr node scripts/fetch-ocr-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.env.TESSERACT_LANG_PATH ? path.resolve(process.env.TESSERACT_LANG_PATH) : path.join(serverRoot, 'ocr');

const LANGS = [
  { code: 'eng', required: true },
  { code: 'aze', required: false },
  { code: 'deu', required: false },
  { code: 'rus', required: false },
];

// Same data tesseract.js would fetch by itself (LSTM "best" integer model, a few MB gzipped), with the
// tessdata GitHub mirror as a fallback.
const sourcesFor = (code) => [
  `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${code}/4.0.0_best_int/${code}.traineddata.gz`,
  `https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_best_int/${code}.traineddata.gz`,
];

const fetchLang = async (code) => {
  const target = path.join(dir, `${code}.traineddata.gz`);
  if (fs.existsSync(target) || fs.existsSync(path.join(dir, `${code}.traineddata`))) {
    console.log(`OCR data for ${code} already present in ${dir}`);
    return true;
  }
  let lastError;
  for (const url of sourcesFor(code)) {
    try {
      console.log(`Downloading ${url} …`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length < 500_000 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error('unexpected content (not a gzip file)');
      fs.writeFileSync(`${target}.part`, bytes);
      fs.renameSync(`${target}.part`, target);
      console.log(`Saved ${(bytes.length / 1024 / 1024).toFixed(1)} MB to ${target}`);
      return true;
    } catch (err) {
      lastError = err;
      console.warn(`  failed: ${err.message}`);
    }
  }
  console.error(`Could not download the OCR language data for ${code}:`, String(lastError));
  return false;
};

const main = async () => {
  fs.mkdirSync(dir, { recursive: true });
  for (const { code, required } of LANGS) {
    const ok = await fetchLang(code);
    if (!ok && required) {
      console.error(`Place ${code}.traineddata(.gz) manually into`, dir);
      process.exit(1);
    }
  }
};

main();
