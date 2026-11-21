import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Notify } from './notify';

describe('Notify', () => {
  let service: Notify;
  let swDescriptor: PropertyDescriptor | undefined;

  function mockNotification(permission: NotificationPermission, throws = false) {
    const ctor = vi.fn(function (this: unknown) {
      if (throws) {
        throw new TypeError('Illegal constructor');
      }
    });
    Object.defineProperty(ctor, 'permission', {
      configurable: true,
      get: () => permission,
    });
    vi.stubGlobal('Notification', ctor);
    return ctor;
  }

  function mockServiceWorker(registration: unknown) {
    Object.defineProperty(Navigator.prototype, 'serviceWorker', {
      configurable: true,
      value:
        registration === undefined
          ? undefined
          : { getRegistration: async () => registration },
    });
  }

  beforeEach(() => {
    swDescriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'serviceWorker');
    service = TestBed.inject(Notify);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (swDescriptor) {
      Object.defineProperty(Navigator.prototype, 'serviceWorker', swDescriptor);
    } else {
      delete (Navigator.prototype as unknown as Record<string, unknown>)['serviceWorker'];
    }
  });

  it('reports delivered=false when notifications are unsupported', async () => {
    vi.stubGlobal('Notification', undefined);
    expect(service.supported()).toBe(false);
    expect(await service.showGeneric('t', 'b', 'tag')).toBe(false);
  });

  it('stays quiet until permission is granted', async () => {
    const ctor = mockNotification('default');
    mockServiceWorker(undefined);
    expect(await service.showGeneric('t', 'b', 'tag')).toBe(false);
    expect(ctor).not.toHaveBeenCalled();
  });

  it('prefers the service worker registration (the Android path)', async () => {
    mockNotification('granted');
    const showNotification = vi.fn(async () => undefined);
    mockServiceWorker({ showNotification });

    expect(await service.showGeneric('title', 'body', 'drivelog-backup')).toBe(true);
    expect(showNotification).toHaveBeenCalledWith('title', {
      body: 'body',
      tag: 'drivelog-backup',
    });
  });

  it('falls back to a page notification without a registration', async () => {
    const ctor = mockNotification('granted');
    mockServiceWorker(undefined);

    expect(await service.showGeneric('t', 'b', 'tag')).toBe(true);
    expect(ctor).toHaveBeenCalledWith('t', { body: 'b', tag: 'tag' });
  });

  it('reports delivered=false when the page constructor throws (Android)', async () => {
    mockNotification('granted', true);
    mockServiceWorker(undefined);
    expect(await service.showGeneric('t', 'b', 'tag')).toBe(false);
  });

  it('reports delivered=false when showNotification rejects', async () => {
    mockNotification('granted');
    mockServiceWorker({
      showNotification: vi.fn(async () => Promise.reject(new Error('denied'))),
    });
    expect(await service.showGeneric('t', 'b', 'tag')).toBe(false);
  });
});
