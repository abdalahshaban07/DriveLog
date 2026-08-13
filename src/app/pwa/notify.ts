import { Injectable } from '@angular/core';
import type { DueItem } from '../domain/models';

@Injectable({ providedIn: 'root' })
export class Notify {
  supported(): boolean {
    return typeof Notification !== 'undefined';
  }

  permission(): NotificationPermission | 'unsupported' {
    if (!this.supported()) {
      return 'unsupported';
    }
    return Notification.permission;
  }

  async requestPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (!this.supported()) {
      return 'unsupported';
    }
    return Notification.requestPermission();
  }

  async notifyDue(item: DueItem, title: string, body: string): Promise<void> {
    this.show(title, body, item.id);
  }

  /** Deploy / new-version ping (tag = update so it replaces prior update toasts). */
  notifyUpdate(title: string, body: string): void {
    this.show(title, body, 'drivelog-update');
  }

  private show(title: string, body: string, tag: string): void {
    if (!this.supported() || Notification.permission !== 'granted') {
      return;
    }
    try {
      new Notification(title, { body, tag });
    } catch {
      /* ignore */
    }
  }
}
