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
    if (!this.supported() || Notification.permission !== 'granted') {
      return;
    }
    new Notification(title, { body, tag: item.id });
  }
}
