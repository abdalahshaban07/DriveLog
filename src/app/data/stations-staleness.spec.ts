import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('station snapshot freshness', () => {
  it('is no older than 60 days', () => {
    const file = JSON.parse(readFileSync(join(process.cwd(), 'public/data/eg-stations.json'), 'utf8')) as { updated: string };
    const updated = new Date(file.updated + 'T00:00:00Z').getTime();
    const ageDays = (Date.now() - updated) / (1000 * 60 * 60 * 24);
    expect(ageDays).toBeLessThanOrEqual(60);
  });
});