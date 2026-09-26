#!/usr/bin/env node
/**
 * Move PaddleOCR engine chunks out of the service-worker prefetch group.
 * ponytail: matches file bytes (`cv.Mat`, `ort-wasm`), not hashed names.
 * Ceiling: a renamed OpenCV/ORT build that drops both markers stays prefetched
 * (~10MB on install). Upgrade path: stable chunk names in the Angular build.
 */
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKERS = [Buffer.from('cv.Mat'), Buffer.from('ort-wasm')];

export function lazyOcrUrls(ngsw, readFile) {
  const app = ngsw.assetGroups.find((g) => g.name === 'app');
  if (!app) {
    throw new Error('ngsw.json has no app asset group');
  }
  const base = ngsw.index.replace(/\/index\.html$/, '');
  const lazy = [];
  const keep = [];
  for (const url of app.urls) {
    if (!url.startsWith(base)) {
      throw new Error(`asset url ${url} is outside ${base}`);
    }
    const bytes = readFile(url.slice(base.length));
    const heavy = MARKERS.some((m) => bytes.includes(m));
    (heavy ? lazy : keep).push(url);
  }
  if (lazy.length === 0) {
    const already = ngsw.assetGroups.find((g) => g.name === 'ocr');
    if (already?.urls?.length) {
      return already.urls;
    }
    throw new Error('no PaddleOCR chunks found (cv.Mat / ort-wasm)');
  }
  app.urls = keep;
  const existing = ngsw.assetGroups.find((g) => g.name === 'ocr');
  const group = existing ?? {
    name: 'ocr',
    installMode: 'lazy',
    updateMode: 'lazy',
    cacheQueryOptions: { ignoreVary: true },
    urls: [],
    patterns: [],
  };
  group.urls = lazy;
  if (!existing) {
    ngsw.assetGroups.push(group);
  }
  return lazy;
}

function selfCheck() {
  const dir = mkdtempSync(join(tmpdir(), 'ngsw-ocr-'));
  try {
    writeFileSync(join(dir, 'engine.js'), 'cv.Mat ort-wasm');
    writeFileSync(join(dir, 'fill.js'), 'PP-OCRv5 fill-up');
    const ngsw = {
      index: '/DriveLog/index.html',
      assetGroups: [
        {
          name: 'app',
          installMode: 'prefetch',
          urls: ['/DriveLog/engine.js', '/DriveLog/fill.js'],
        },
      ],
    };
    const lazy = lazyOcrUrls(ngsw, (rel) => readFileSync(join(dir, rel)));
    if (lazy.join() !== '/DriveLog/engine.js') {
      throw new Error(`unexpected lazy set: ${lazy.join()}`);
    }
    if (ngsw.assetGroups[0].urls.join() !== '/DriveLog/fill.js') {
      throw new Error('fill-up chunk was removed from prefetch');
    }
    const again = lazyOcrUrls(ngsw, (rel) => readFileSync(join(dir, rel)));
    if (
      again.join() !== lazy.join() ||
      ngsw.assetGroups.filter((g) => g.name === 'ocr').length !== 1
    ) {
      throw new Error('second pass duplicated the ocr group');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const ngswPath = join(root, 'dist/drivelog/browser/ngsw.json');
  const browser = join(root, 'dist/drivelog/browser');
  const ngsw = JSON.parse(readFileSync(ngswPath, 'utf8'));
  const lazy = lazyOcrUrls(ngsw, (rel) => readFileSync(join(browser, rel)));
  writeFileSync(ngswPath, JSON.stringify(ngsw, null, 2) + '\n');
  console.log(`lazy OCR chunks: ${lazy.join(', ')}`);
}

if (process.argv.includes('--self-check')) {
  selfCheck();
  console.log('ngsw-lazy-ocr self-check ok');
} else {
  main();
}
