import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bindFormDraft, clearFormDrafts, FormDrafts } from './form-draft';

describe('form drafts', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });
  it('captures changed fields only in a separate draft, restores, and discards', () => {
    const store = TestBed.inject(FormDrafts);
    const value = signal('');
    let draft = TestBed.runInInjectionContext(() =>
      bindFormDraft(store, 'maintenance:car:new', { value }),
    );
    TestBed.tick();
    expect(store.read('maintenance:car:new')).toBeNull();
    value.set('oil');
    TestBed.tick();
    expect(store.read('maintenance:car:new')).toEqual({ value: 'oil' });
    draft.stop();
    const next = signal('');
    draft = TestBed.runInInjectionContext(() =>
      bindFormDraft(store, 'maintenance:car:new', { value: next }),
    );
    expect(next()).toBe('oil');
    expect(draft.restored()).toBe(true);
    draft.clear();
    TestBed.tick();
    expect(store.read('maintenance:car:new')).toBeNull();
  });
  it('scopes by car and record and clears only app drafts on restore/wipe', () => {
    const store = TestBed.inject(FormDrafts);
    store.write('car-a:new', { value: 'a' });
    store.write('car-b:edit', { value: 'b' });
    expect(store.read('car-b:new')).toBeNull();
    localStorage.setItem('other-app', 'keep');
    clearFormDrafts();
    expect(store.read('car-a:new')).toBeNull();
    expect(localStorage.getItem('other-app')).toBe('keep');
  });
  it('shows storage failure instead of claiming the draft was saved', () => {
    const store = TestBed.inject(FormDrafts);
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Error('quota');
    });
    store.write('a', { value: 'x' });
    expect(store.failed()).toBe(true);
    write.mockRestore();
  });
});
