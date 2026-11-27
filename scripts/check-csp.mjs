#!/usr/bin/env node
/**
 * Fails the build when an inline <script> in the built index.html is not covered by
 * the CSP meta's script-src hashes (a mismatch would leave the page unstyled or
 * the service worker unregistered on the live site).
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const file = process.argv[2] ?? 'dist/drivelog/browser/index.html';
const html = readFileSync(file, 'utf8');
const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
if (!meta) {
  throw new Error('index.html has no CSP meta');
}
const scriptSrc = meta[1].split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src ')) ?? '';
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
let bad = 0;
for (const body of inline) {
  const h = `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
  if (!scriptSrc.includes(h)) {
    console.error(`inline script not allowed by CSP: ${h}`);
    bad++;
  }
}
if (bad) {
  process.exit(1);
}
console.log(`CSP ok: ${inline.length} inline scripts hashed`);
