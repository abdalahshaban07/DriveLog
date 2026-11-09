import { Injectable, InjectionToken, computed, inject } from '@angular/core';
import { Db } from '../data/db';
import { encryptBackup } from '../domain/backup-crypto';
import { backupFileName, isWeeklyDue, pruneBackupNames } from '../domain/backup-schedule';
import { I18n } from '../i18n/i18n';
import { Notify } from './notify';

/** File System Access surface we use; lib.dom omits the permission methods. */
export interface BackupDirectoryHandle {
  readonly name: string;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemFileHandle>;
  removeEntry(name: string): Promise<void>;
  values(): AsyncIterableIterator<FileSystemFileHandle>;
  queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}

export type DirectoryPicker = () => Promise<BackupDirectoryHandle | null>;

/** Seam for tests and browsers without showDirectoryPicker. */
export const DIRECTORY_PICKER = new InjectionToken<DirectoryPicker | null>(
  'DIRECTORY_PICKER',
  {
    providedIn: 'root',
    factory: () => {
      const w = globalThis as unknown as {
        showDirectoryPicker?: (options?: {
          mode?: 'read' | 'readwrite';
        }) => Promise<BackupDirectoryHandle>;
      };
      return typeof w.showDirectoryPicker === 'function'
        ? () => w.showDirectoryPicker!({ mode: 'readwrite' })
        : null;
    },
  },
);

/** Weekly folder backup; falls back to a reminder when write access needs a gesture. */
@Injectable({ providedIn: 'root' })
export class AutoBackup {
  private readonly db = inject(Db);
  private readonly i18n = inject(I18n);
  private readonly notify = inject(Notify);
  private readonly picker = inject(DIRECTORY_PICKER);

  readonly supported = computed(() => this.picker !== null);
  readonly state = this.db.backupState;
  readonly connected = computed(() => this.state()?.directoryHandle != null);
  readonly passphraseSet = computed(() => Boolean(this.state()?.passphrase));

  /** Link a user-picked folder, then write the first copy immediately. */
  async chooseFolder(): Promise<boolean> {
    if (!this.picker) {
      return false;
    }
    let handle: BackupDirectoryHandle | null;
    try {
      handle = await this.picker();
    } catch {
      return false; // user closed the picker
    }
    if (!handle) {
      return false;
    }
    try {
      await this.db.updateBackupState({
        directoryHandle: handle as unknown as FileSystemDirectoryHandle,
        directoryName: handle.name,
        lastReminderAt: undefined,
      });
      return await this.backUpNow();
    } catch {
      return false;
    }
  }

  /** Boot path: write when due and already granted, else nudge at most weekly. */
  async check(): Promise<void> {
    const state = this.state();
    const dir = this.dirOf(state?.directoryHandle);
    if (!dir) {
      return;
    }
    const now = new Date();
    let perm: PermissionState;
    try {
      perm = await dir.queryPermission({ mode: 'readwrite' });
    } catch {
      return; // folder removed or handle revoked
    }
    if (perm === 'granted') {
      if (isWeeklyDue(state?.lastBackupAt, now)) {
        await this.backUpNow();
      }
      return;
    }
    if (isWeeklyDue(state?.lastReminderAt, now)) {
      this.notify.showGeneric(
        this.i18n.t('backup.reminderTitle'),
        this.i18n.t('backup.reminderBody'),
        'drivelog-backup',
      );
      await this.db.updateBackupState({ lastReminderAt: now.toISOString() });
    }
  }

  /** Write one dated copy and prune old ones. False when access is missing. */
  async backUpNow(): Promise<boolean> {
    const state = this.state();
    const dir = this.dirOf(state?.directoryHandle);
    if (!dir) {
      return false;
    }
    try {
      if ((await dir.queryPermission({ mode: 'readwrite' })) !== 'granted') {
        return false;
      }
      const now = new Date();
      const plain = JSON.stringify(this.db.exportBackup(), null, 2);
      const passphrase = state?.passphrase;
      const payload = passphrase
        ? JSON.stringify(await encryptBackup(plain, passphrase), null, 2)
        : plain;
      const file = await dir.getFileHandle(backupFileName(now, Boolean(passphrase)), {
        create: true,
      });
      const writable = await file.createWritable();
      await writable.write(payload);
      await writable.close();
      await this.prune(dir);
      await this.db.updateBackupState({ lastBackupAt: now.toISOString() });
      return true;
    } catch {
      return false;
    }
  }

  /** Settings button: re-ask permission inside the click gesture, then write. */
  async grantAndBackUp(): Promise<boolean> {
    const dir = this.dirOf(this.state()?.directoryHandle);
    if (!dir) {
      return false;
    }
    try {
      if ((await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') {
        return false;
      }
    } catch {
      return false;
    }
    return this.backUpNow();
  }

  async setPassphrase(passphrase: string): Promise<void> {
    await this.db.updateBackupState({ passphrase: passphrase || undefined });
  }

  /** Unlink the folder; written files stay where they are. */
  async disconnect(): Promise<void> {
    await this.db.updateBackupState({
      directoryHandle: undefined,
      directoryName: undefined,
      lastBackupAt: undefined,
      lastReminderAt: undefined,
      passphrase: undefined,
    });
  }

  private dirOf(
    handle: FileSystemDirectoryHandle | undefined,
  ): BackupDirectoryHandle | null {
    return (handle as unknown as BackupDirectoryHandle | undefined) ?? null;
  }

  private async prune(dir: BackupDirectoryHandle): Promise<void> {
    const names: string[] = [];
    for await (const entry of dir.values()) {
      names.push(entry.name);
    }
    for (const name of pruneBackupNames(names)) {
      await dir.removeEntry(name);
    }
  }
}