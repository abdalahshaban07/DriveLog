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

  /** True only when a notification actually reached the user. */
  async notifyDue(item: DueItem, title: string, body: string): Promise<boolean> {
    return this.show(title, body, item.id);
  }

  /** Generic tagged notification (health/budget/forecast). */
  showGeneric(title: string, body: string, tag: string): Promise<boolean> {
    return this.show(title, body, tag);
  }

  /** Deploy / new-version ping (tag = update so it replaces prior update toasts). */
  notifyUpdate(title: string, body: string): Promise<boolean> {
    return this.show(title, body, 'drivelog-update');
  }

  private async show(title: string, body: string, tag: string): Promise<boolean> {
    if (!this.supported() || Notification.permission !== 'granted') {
      return false;
    }
    try {
      // Page-context `new Notification` throws on Android; the service worker
      // registration is the reliable path there and fine everywhere else.
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration) {
        await registration.showNotification(title, { body, tag });
        return true;
      }
      new Notification(title, { body, tag });
      return true;
    } catch {
      return false;
    }
  }
}
