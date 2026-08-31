import { describe, expect, it, vi } from 'vitest';
import { DestroyRef } from '@angular/core';
import { createAnimeScope } from './anime-scope';
import { MotionPolicy } from './motion-policy';

describe('createAnimeScope', () => {
  it('returns null when reduced motion is preferred', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const policy = new MotionPolicy();
    const destroyRef = {
      onDestroy: () => () => undefined,
      destroyed: false,
    } as unknown as DestroyRef;
    const scope = await createAnimeScope(document.createElement('div'), destroyRef, policy);
    expect(scope).toBeNull();
    vi.unstubAllGlobals();
  });
});
