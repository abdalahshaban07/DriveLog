import { DestroyRef } from '@angular/core';
import type { Scope } from 'animejs';
import { MotionPolicy, type AnimeSurface } from './motion-policy';

export async function createAnimeScope(
  root: HTMLElement,
  destroyRef: DestroyRef,
  policy: MotionPolicy,
  surface: AnimeSurface = 'sparkline',
): Promise<Scope | null> {
  if (!policy.allowAnime(surface)) {
    return null;
  }
  try {
    const { createScope } = await import('animejs');
    const scope = createScope({ root });
    destroyRef.onDestroy(() => scope.revert());
    return scope;
  } catch {
    return null;
  }
}
