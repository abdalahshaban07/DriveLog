import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { UpdateModal } from './update-modal';
import { I18n } from '../i18n/i18n';

describe('UpdateModal', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdateModal],
      providers: [
        {
          provide: I18n,
          useValue: {
            t: (k: string, params?: Record<string, string | number>) =>
              params ? `${k}:${JSON.stringify(params)}` : k,
            language: () => 'en' as const,
          },
        },
      ],
    }).compileComponents();
  });

  it('shows one note as a card: feature title, sentence, and quiet points', () => {
    const fixture = TestBed.createComponent(UpdateModal);
    fixture.componentRef.setInput('title', "What's new");
    fixture.componentRef.setInput('cards', [
      {
        icon: 'chart' as const,
        kicker: 'Reports',
        title: 'PDF reports, redesigned',
        body: 'One clearer report.',
        points: ['Summary first', 'Same layout'],
      },
    ]);
    fixture.componentRef.setInput('releaseId', 'v1.6');
    fixture.componentRef.setInput('isUpdate', false);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.update-sheet__title')?.textContent).toContain(
      'PDF reports, redesigned',
    );
    expect(el.querySelector('.update-sheet__kicker')?.textContent).toContain('v1.6');
    expect(el.querySelector('.update-sheet__body')?.textContent).toContain('One clearer report.');
    expect(el.querySelectorAll('.note__facts li').length).toBe(2);
    expect(el.querySelector('.note')).toBeNull();
    expect(el.querySelector('.update-sheet__close')).toBeNull();
    expect(el.querySelector('.update-sheet__later')).toBeNull();
    expect(el.querySelector('app-primary-button')).toBeTruthy();
  });

  it('lists several notes as icon, title, and one line', () => {
    const fixture = TestBed.createComponent(UpdateModal);
    fixture.componentRef.setInput('title', "What's new");
    fixture.componentRef.setInput('cards', [
      {
        icon: 'fuel' as const,
        kicker: 'Health',
        title: 'Fuel',
        body: 'Feature one',
        points: ['Glance counts'],
      },
      {
        icon: 'chart' as const,
        kicker: '',
        title: 'Charts',
        body: 'Feature two',
        points: [],
      },
    ]);
    fixture.componentRef.setInput('isUpdate', false);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.update-sheet__title')?.textContent).toContain("What's new");
    expect(el.querySelector('.update-sheet__lead')?.textContent).toContain('update.changeCount');
    const items = el.querySelectorAll('.note');
    expect(items.length).toBe(2);
    expect(items[0]?.querySelector('.note__title')?.textContent).toBe('Fuel');
    expect(items[0]?.querySelector('.note__line')?.textContent).toContain('Feature one');
    expect(items[0]?.querySelector('.note__facts')).toBeNull();
    expect(items[0]?.querySelector('svg')).toBeTruthy();
    expect(items[1]?.querySelector('.note__line')?.textContent).toContain('Feature two');
  });

  it('keeps the update prompt to one sentence and a text later action', () => {
    const fixture = TestBed.createComponent(UpdateModal);
    fixture.componentRef.setInput('title', 'New version available');
    fixture.componentRef.setInput('cards', [
      {
        icon: 'sparkle' as const,
        kicker: '',
        title: 'Should stay hidden',
        body: 'Not on the update prompt',
        points: [],
      },
    ]);
    fixture.componentRef.setInput('isUpdate', true);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.update-sheet__title')?.textContent).toContain(
      'New version available',
    );
    expect(el.querySelector('.update-sheet__body')?.textContent).toContain('update.notifyBody');
    expect(el.textContent).not.toContain('Should stay hidden');
    expect(el.querySelector('.note')).toBeNull();
    expect(el.querySelector('.update-sheet__later')?.textContent).toContain('update.later');
    expect(el.querySelector('dialog.update-sheet')).toBeTruthy();
  });
});
