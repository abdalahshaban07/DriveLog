import { describe, expect, it } from 'vitest';
import { mayReloadQuietly, shouldAutoApplySwUpdate, SW_IDLE_RELOAD_MS, SW_RELOAD_KEY } from './install-pwa';

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

describe('mayReloadQuietly', () => {
  const idle = { hidden: false, editing: false, dialogOpen: false, idleMs: SW_IDLE_RELOAD_MS };

  it('reloads a backgrounded app', () => {
    expect(mayReloadQuietly({ ...idle, hidden: true, idleMs: 0 })).toBe(true);
  });

  it('reloads an idle screen', () => {
    expect(mayReloadQuietly(idle)).toBe(true);
    expect(mayReloadQuietly({ ...idle, idleMs: SW_IDLE_RELOAD_MS - 1 })).toBe(false);
  });

  it('never interrupts typing or an open sheet', () => {
    expect(mayReloadQuietly({ ...idle, editing: true })).toBe(false);
    expect(mayReloadQuietly({ ...idle, editing: true, hidden: true })).toBe(false);
    expect(mayReloadQuietly({ ...idle, dialogOpen: true })).toBe(false);
  });
});
