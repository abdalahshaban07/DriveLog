import { describe, expect, it } from 'vitest';
import { normalizeWhatsNewEntry, type WhatsNewEntry } from './whats-new';

describe('normalizeWhatsNewEntry', () => {
  it('maps legacy strings to sparkle body-only cards', () => {
    expect(normalizeWhatsNewEntry('Hello')).toEqual({
      icon: 'sparkle',
      title: '',
      body: 'Hello',
    });
  });

  it('keeps valid icons and falls back on unknown', () => {
    const ok: WhatsNewEntry = { icon: 'fuel', title: 'T', body: 'B' };
    expect(normalizeWhatsNewEntry(ok)).toEqual(ok);
    expect(
      normalizeWhatsNewEntry({
        icon: 'nope' as 'fuel',
        title: 'T',
        body: 'B',
      }).icon,
    ).toBe('sparkle');
  });
});
