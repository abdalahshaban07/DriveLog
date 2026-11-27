/**
 * Ask the browser to keep this origin's data (IndexedDB) instead of evicting it
 * when the device runs low on space. All the user's records live only in
 * IndexedDB, so an eviction is total data loss with no server copy.
 *
 * Best effort by design: Chrome grants silently once the site is engaged or
 * installed, Safari may ignore the request, and private mode can refuse. None
 * of those are errors worth showing anyone.
 */

export interface StorageManagerLike {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}

/** True when the origin is now protected, or already was. */
export async function requestPersistentStorage(
  manager: StorageManagerLike | null | undefined,
): Promise<boolean> {
  if (!manager?.persist) {
    return false;
  }
  try {
    if (manager.persisted && (await manager.persisted())) {
      return true;
    }
    return await manager.persist();
  } catch {
    return false;
  }
}

/** The browser's StorageManager, when the platform has one. */
export function storageManager(): StorageManagerLike | null {
  const nav = globalThis.navigator as (Navigator & { storage?: StorageManagerLike }) | undefined;
  return nav?.storage ?? null;
}
