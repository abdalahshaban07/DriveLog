#!/usr/bin/env node
/**
 * Build public/whats-new.json from git history (Pages deploy).
 * Local/dev keeps the committed fallback; CI overwrites before ng build.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'whats-new.json');
const CARD_CAP = 6;
const FALLBACK_COMMIT_COUNT = 15;
const DEFAULT_BODY = 'Included in this release.';
const TYPE_RE = /^(feat|fix|style|ui|refactor|docs|test|chore|perf|ci)(\([^)]+\))?:\s*/i;

export function iconFromSubject(subject) {
  const m = /^(feat|fix|style|ui|refactor|docs|test|chore|perf|ci)(\([^)]+\))?:/i.exec(
    subject,
  );
  const type = m?.[1]?.toLowerCase();
  if (type === 'fix') {
    return 'bug';
  }
  if (type === 'style' || type === 'ui') {
    return 'palette';
  }
  if (type === 'feat') {
    const lower = subject.toLowerCase();
    if (/\bfuel\b|\bfill[- ]?up\b/.test(lower)) {
      return 'fuel';
    }
    if (/\bchart\b|\binsight\b/.test(lower)) {
      return 'chart';
    }
    if (/\bmaint/.test(lower)) {
      return 'wrench';
    }
    return 'sparkle';
  }
  return 'sparkle';
}

export function stripTypePrefix(subject) {
  const stripped = subject.replace(TYPE_RE, '').trim();
  return stripped || subject.trim();
}

export function shouldKeepCommit(subject) {
  const s = String(subject ?? '').trim();
  if (!s) {
    return false;
  }
  if (/^merge\b/i.test(s)) {
    return false;
  }
  if (/^chore\(deps\)/i.test(s)) {
    return false;
  }
  if (/^ci:/i.test(s)) {
    return false;
  }
  return true;
}

export function titleFromSubject(subject) {
  const t = stripTypePrefix(subject);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function bodyFromMessage(body) {
  if (!body) {
    return DEFAULT_BODY;
  }
  const line = body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('Co-authored-by:'));
  return line || DEFAULT_BODY;
}

/**
 * @param {{ subject: string, body?: string }[]} commits
 */
export function cardsFromCommits(commits, cap = CARD_CAP) {
  const cards = [];
  for (const c of commits) {
    if (!shouldKeepCommit(c.subject)) {
      continue;
    }
    cards.push({
      icon: iconFromSubject(c.subject),
      title: titleFromSubject(c.subject),
      body: bodyFromMessage(c.body),
    });
    if (cards.length >= cap) {
      break;
    }
  }
  return cards;
}

export function genericCards() {
  return {
    en: [{ icon: 'sparkle', title: 'App update', body: DEFAULT_BODY }],
    ar: [{ icon: 'sparkle', title: 'تحديث التطبيق', body: DEFAULT_BODY }],
  };
}

export function buildWhatsNewFile({ date, sha, cards }) {
  const short = String(sha).replace(/^#/, '').slice(0, 7);
  const id = `${date}-${short}`;
  if (!cards.length) {
    const g = genericCards();
    return { id, en: g.en, ar: g.ar };
  }
  // ponytail: no translation API — mirror EN into AR
  return { id, en: cards, ar: cards };
}

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    ...opts,
  }).trim();
}

function parseLog(raw) {
  if (!raw) {
    return [];
  }
  return raw
    .split('\0')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const nl = chunk.indexOf('\n');
      if (nl === -1) {
        return { subject: chunk, body: '' };
      }
      return { subject: chunk.slice(0, nl).trim(), body: chunk.slice(nl + 1) };
    });
}

function collectCommits() {
  const format = '%s%n%b%x00';
  let since = '';
  try {
    since = git(['log', '-1', '--format=%H', '--', 'public/whats-new.json']);
  } catch {
    since = '';
  }
  let raw = '';
  if (since) {
    try {
      raw = git(['log', `${since}..HEAD`, '--no-merges', `--format=${format}`]);
    } catch {
      raw = '';
    }
  }
  if (!raw) {
    raw = git([
      'log',
      '-n',
      String(FALLBACK_COMMIT_COUNT),
      '--no-merges',
      `--format=${format}`,
    ]);
  }
  return parseLog(raw);
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function shortSha() {
  const env = process.env['GITHUB_SHA'];
  if (env) {
    return env.slice(0, 7);
  }
  return git(['rev-parse', '--short', 'HEAD']);
}

function writeAtomic(path, json) {
  mkdirSync(dirname(path), { recursive: true });
  const dir = mkdtempSync(join(tmpdir(), 'whats-new-'));
  const tmp = join(dir, 'whats-new.json');
  writeFileSync(tmp, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
}

export function selfCheck() {
  const { strictEqual } = awaitImportAssert();
  strictEqual(shouldKeepCommit('Merge pull request #1'), false, 'drop merge');
  strictEqual(shouldKeepCommit('chore(deps): bump foo'), false, 'drop deps');
  strictEqual(shouldKeepCommit('ci: pages'), false, 'drop ci');
  strictEqual(shouldKeepCommit('feat: around list'), true, 'keep feat');
  strictEqual(iconFromSubject('fix: gps denied'), 'bug', 'fix→bug');
  strictEqual(iconFromSubject('style: chips'), 'palette', 'style→palette');
  strictEqual(iconFromSubject('feat: log fill-up from home'), 'fuel', 'feat fuel');
  strictEqual(stripTypePrefix('feat(pwa): install prompt'), 'install prompt', 'strip');
  const cards = cardsFromCommits([
    { subject: 'Merge main', body: '' },
    { subject: 'feat: nearby stations', body: 'Pick a station chip.\n\n' },
    { subject: 'fix: open now filter', body: '' },
  ]);
  strictEqual(cards.length, 2, 'filter+cap');
  strictEqual(cards[0].icon, 'sparkle', 'nearby sparkle');
  strictEqual(cards[0].title, 'Nearby stations', 'title case');
  strictEqual(cards[0].body, 'Pick a station chip.', 'body line');
  strictEqual(cards[1].icon, 'bug', 'fix icon');
  const file = buildWhatsNewFile({
    date: '2026-09-10',
    sha: 'abc1234def',
    cards,
  });
  strictEqual(file.id, '2026-09-10-abc1234', 'id date+sha');
  strictEqual(file.ar.length, file.en.length, 'ar mirrors en');
  const empty = buildWhatsNewFile({ date: '2026-09-10', sha: 'deadbee', cards: [] });
  strictEqual(empty.en[0].title, 'App update', 'generic en');
  strictEqual(empty.ar[0].title, 'تحديث التطبيق', 'generic ar');
  console.log('generate-whats-new self-check ok');
}

function awaitImportAssert() {
  // ponytail: keep node:assert inline so --self-check works without vitest
  return { strictEqual: (actual, expected, msg) => {
    if (actual !== expected) {
      throw new Error(`${msg}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
    }
  } };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-check')) {
    selfCheck();
    return;
  }
  const cards = cardsFromCommits(collectCommits());
  const file = buildWhatsNewFile({
    date: todayUtc(),
    sha: shortSha(),
    cards,
  });
  writeAtomic(OUT, file);
  console.log(`wrote ${OUT} id=${file.id} cards=${file.en.length}`);
}

const isMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main();
}
