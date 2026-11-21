import { effect, Injectable, signal } from '@angular/core';

export function clearFormDrafts(): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith('drivelog:draft:v1:')) localStorage.removeItem(key);
  }
}

export type DraftFields = Record<string, string | null>;
@Injectable({ providedIn: 'root' })
export class FormDrafts {
  private readonly prefix = 'drivelog:draft:v1:';
  readonly failed = signal(false);
  read(key: string): DraftFields | null {
    try {
      const raw = JSON.parse(localStorage.getItem(this.prefix + key) ?? 'null');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      if (!Object.values(raw).every((value) => value === null || typeof value === 'string'))
        return null;
      return raw;
    } catch {
      this.failed.set(true);
      return null;
    }
  }
  write(key: string, value: DraftFields): void {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch {
      this.failed.set(true);
    }
  }
  remove(key: string): void {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch {
      this.failed.set(true);
    }
  }
}

/** Context-scoped draft, separate from the ledger. Call from an injection context. */
export function bindFormDraft(
  store: FormDrafts,
  key: string,
  fields: Record<string, { (): string | null; set(value: any): void }>,
) {
  const capture = (): DraftFields =>
    Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value()]));
  let baseline = JSON.stringify(capture());
  const restored = signal(false);
  const candidate = store.read(key);
  if (candidate) {
    for (const [name, value] of Object.entries(candidate)) fields[name]?.set(value);
    restored.set(true);
  }
  const enabled = signal(true);
  const watcher = effect(() => {
    if (!enabled()) return;
    const value = capture();
    if (JSON.stringify(value) !== baseline) store.write(key, value);
    else store.remove(key);
  });
  return {
    restored,
    stop() {
      watcher.destroy();
    },
    clear() {
      enabled.set(false);
      store.remove(key);
      restored.set(false);
    },
    reset() {
      baseline = JSON.stringify(capture());
      enabled.set(true);
      restored.set(false);
      store.remove(key);
    },
  };
}
