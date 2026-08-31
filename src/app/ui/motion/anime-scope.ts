import { DestroyRef } from '@angular/core';
import type { Scope } from 'animejs';
import { MotionPolicy } from './motion-policy';

export async function createAnimeScope(
  root: HTMLElement,
  destroyRef: DestroyRef,
  policy: MotionPolicy,
): Promise<Scope | null> {
  if (!policy.allowAnime('sparkline')) {
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
