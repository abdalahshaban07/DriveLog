import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Db } from '../data/db';
import { decryptBackup, isEncryptedBackup } from '../domain/backup-crypto';
import { BACKUP_KEEP, backupFileName } from '../domain/backup-schedule';
import type { BackupFile, BackupState } from '../domain/models';
import { I18n } from '../i18n/i18n';
import { Notify } from './notify';
import { AutoBackup, DIRECTORY_PICKER, type BackupDirectoryHandle } from './auto-backup';

// jsdom may not expose SubtleCrypto; Node's webcrypto is API-identical.
beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    globalThis.crypto = webcrypto as unknown as Crypto;
  }
});

function makeFakeDir(perm: PermissionState = 'granted') {
  const files = new Map<string, string>();
  const dir = {
    name: 'Backups',
    files,
    getFileHandle: vi.fn(async (name: string) => ({
      name,
      createWritable: async () => ({
        write: async (data: string) => {
          files.set(name, data);
        },
        close: async () => {},
      }),
    }) as unknown as FileSystemFileHandle),
    removeEntry: vi.fn(async (name: string) => {
      files.delete(name);
    }),
    values: async function* () {
      for (const name of files.keys()) {
        yield { name } as FileSystemFileHandle;
      }
    },
    queryPermission: vi.fn(async () => perm),
    requestPermission: vi.fn(async () => perm),
  };
  return dir;
}

describe('AutoBackup', () => {
  const backupState = signal<BackupState | null>(null);
  const updateBackupState = vi.fn(async (patch: Partial<Omit<BackupState, 'id'>>) => {
    backupState.update((s) => ({
      ...(s ?? { id: 'backupState' }),
      ...patch,
      id: 'backupState',
    }));
  });
  const exportBackup = vi.fn(
    () =>
      ({
        version: 7,
        exportedAt: '2026-11-08T00:00:00.000Z',
        fillUps: [],
        maintenance: [],
        settings: {},
      }) as unknown as BackupFile,
  );
  const showGeneric = vi.fn();
  let picker: ReturnType<typeof vi.fn<() => Promise<BackupDirectoryHandle | null>>>;
  let service: AutoBackup;

  function configure(p: typeof picker | null): void {
    TestBed.configureTestingModule({
      providers: [
        AutoBackup,
        { provide: DIRECTORY_PICKER, useValue: p },
        {
          provide: Db,
          useValue: {
            backupState: backupState.asReadonly(),
            updateBackupState,
            exportBackup,
          },
        },
        { provide: Notify, useValue: { showGeneric } },
        { provide: I18n, useValue: { t: (k: string) => k } },
      ],
    });
    service = TestBed.inject(AutoBackup);
  }

  function link(dir: ReturnType<typeof makeFakeDir>, extra: Partial<BackupState> = {}): void {
    backupState.set({
      id: 'backupState',
      directoryHandle: dir as unknown as FileSystemDirectoryHandle,
      directoryName: dir.name,
      ...extra,
    });
  }

  beforeEach(() => {
    backupState.set(null);
    updateBackupState.mockClear();
    exportBackup.mockClear();
    showGeneric.mockClear();
    picker = vi.fn(async () => null);
  });

  it('is unsupported and inert without a directory picker', async () => {
    configure(null);
    expect(service.supported()).toBe(false);
    expect(await service.chooseFolder()).toBe(false);
    expect(await service.backUpNow()).toBe(false);
    await service.check();
    expect(updateBackupState).not.toHaveBeenCalled();
  });

  it('links the picked folder and writes the first copy', async () => {
    const dir = makeFakeDir();
    picker.mockResolvedValue(dir as unknown as BackupDirectoryHandle);
    configure(picker);
    expect(service.supported()).toBe(true);

    expect(await service.chooseFolder()).toBe(true);
    expect(service.connected()).toBe(true);
    expect(backupState()?.directoryName).toBe('Backups');
    expect(backupState()?.lastBackupAt).toBeTruthy();
    const names = [...dir.files.keys()];
    expect(names).toEqual([backupFileName(new Date(), false)]);
    const saved = JSON.parse(dir.files.get(names[0]!)!);
    expect(saved.version).toBe(7);
  });

  it('treats a cancelled picker as a no-op', async () => {
    picker.mockRejectedValue(new DOMException('closed', 'AbortError'));
    configure(picker);
    expect(await service.chooseFolder()).toBe(false);
    expect(service.connected()).toBe(false);
    expect(updateBackupState).not.toHaveBeenCalled();
  });

  it('check() writes on boot when a week has elapsed', async () => {
    const dir = makeFakeDir();
    const old = new Date(Date.now() - 8 * 86_400_000).toISOString();
    link(dir, { lastBackupAt: old });
    configure(picker);

    await service.check();
    expect(dir.getFileHandle).toHaveBeenCalledTimes(1);
    expect(Date.parse(backupState()!.lastBackupAt!)).toBeGreaterThan(Date.parse(old));
  });

  it('check() stays quiet when the last copy is fresh', async () => {
    const dir = makeFakeDir();
    link(dir, { lastBackupAt: new Date().toISOString() });
    configure(picker);

    await service.check();
    expect(dir.getFileHandle).not.toHaveBeenCalled();
    expect(showGeneric).not.toHaveBeenCalled();
  });

  it('check() reminds weekly when write access needs a gesture', async () => {
    const dir = makeFakeDir('prompt');
    link(dir);
    configure(picker);

    await service.check();
    expect(dir.getFileHandle).not.toHaveBeenCalled();
    expect(showGeneric).toHaveBeenCalledTimes(1);
    expect(backupState()?.lastReminderAt).toBeTruthy();

    showGeneric.mockClear();
    await service.check();
    expect(showGeneric).not.toHaveBeenCalled();
  });

  it('encrypts the copy when a passphrase is set', async () => {
    const dir = makeFakeDir();
    link(dir, { passphrase: 'secret phrase' });
    configure(picker);

    expect(await service.backUpNow()).toBe(true);
    const name = backupFileName(new Date(), true);
    const payload = JSON.parse(dir.files.get(name)!);
    expect(isEncryptedBackup(payload)).toBe(true);
    const restored = await decryptBackup(payload, 'secret phrase');
    expect(JSON.parse(restored).version).toBe(7);
  });

  it('keeps only the newest copies after a write', async () => {
    const dir = makeFakeDir();
    for (let i = 1; i <= 6; i++) {
      dir.files.set(`drivelog-backup-2026-10-0${i}.json`, '{}');
    }
    dir.files.set('notes.txt', 'unrelated');
    link(dir);
    configure(picker);

    await service.backUpNow();
    const kept = [...dir.files.keys()].filter((n) => n.startsWith('drivelog-backup-'));
    expect(kept.length).toBe(BACKUP_KEEP);
    expect(kept).toContain(backupFileName(new Date(), false));
    expect(dir.files.has('notes.txt')).toBe(true);
    expect(dir.files.has('drivelog-backup-2026-10-01.json')).toBe(false);
  });

  it('grantAndBackUp re-asks permission inside the gesture', async () => {
    const dir = makeFakeDir('prompt');
    dir.requestPermission.mockResolvedValue('granted');
    dir.queryPermission.mockResolvedValue('granted');
    link(dir);
    configure(picker);

    expect(await service.grantAndBackUp()).toBe(true);
    expect(dir.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(dir.getFileHandle).toHaveBeenCalledTimes(1);
  });

  it('backUpNow fails soft when permission is denied', async () => {
    const dir = makeFakeDir('denied');
    link(dir);
    configure(picker);

    expect(await service.backUpNow()).toBe(false);
    expect(dir.getFileHandle).not.toHaveBeenCalled();
    expect(backupState()?.lastBackupAt).toBeUndefined();
  });

  it('disconnect unlinks the folder and clears the passphrase', async () => {
    const dir = makeFakeDir();
    link(dir, { passphrase: 'x', lastBackupAt: new Date().toISOString() });
    configure(picker);

    await service.disconnect();
    expect(service.connected()).toBe(false);
    expect(backupState()?.passphrase).toBeUndefined();
    expect(backupState()?.directoryHandle).toBeUndefined();
  });
});