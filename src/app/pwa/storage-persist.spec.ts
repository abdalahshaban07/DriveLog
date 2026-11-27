import { describe, expect, it } from 'vitest';
import { requestPersistentStorage, storageManager } from './storage-persist';

describe('requestPersistentStorage', () => {
  it('asks once and reports the grant', async () => {
    let asked = 0;
    const granted = await requestPersistentStorage({
      persist: async () => {
        asked++;
        return true;
      },
    });
    expect(granted).toBe(true);
    expect(asked).toBe(1);
  });

  it('skips the request when the origin is already persisted', async () => {
    let asked = 0;
    const granted = await requestPersistentStorage({
      persisted: async () => true,
      persist: async () => {
        asked++;
        return true;
      },
    });
    expect(granted).toBe(true);
    expect(asked).toBe(0);
  });

  it('treats a refusal or a throw as "not protected", never as a crash', async () => {
    expect(await requestPersistentStorage({ persist: async () => false })).toBe(false);
    expect(
      await requestPersistentStorage({
        persist: async () => {
          throw new Error('private mode');
        },
      }),
    ).toBe(false);
    expect(await requestPersistentStorage(null)).toBe(false);
  });

  it('finds the browser storage manager when there is one', () => {
    expect(storageManager()).toBeDefined();
  });
});
