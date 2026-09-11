import { describe, expect, it } from 'vitest';
import { shouldAutoApplySwUpdate, SW_RELOAD_KEY } from './install-pwa';

describe('shouldAutoApplySwUpdate', () => {
  it('applies once per session', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    expect(shouldAutoApplySwUpdate(storage)).toBe(true);
    expect(store.get(SW_RELOAD_KEY)).toBe('1');
    expect(shouldAutoApplySwUpdate(storage)).toBe(false);
  });
});
