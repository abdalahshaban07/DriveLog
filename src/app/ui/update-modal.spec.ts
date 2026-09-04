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
          useValue: { t: (k: string) => k, language: () => 'en' as const },
        },
      ],
    }).compileComponents();
  });

  it('renders release pill and feature cards', () => {
    const fixture = TestBed.createComponent(UpdateModal);
    fixture.componentRef.setInput('title', 'You are on v1');
    fixture.componentRef.setInput('cards', [
      { icon: 'fuel' as const, title: 'Fuel', body: 'Feature one' },
      { icon: 'chart' as const, title: 'Charts', body: 'Feature two' },
    ]);
    fixture.componentRef.setInput('releaseId', '2026-08-31');
    fixture.componentRef.setInput('isUpdate', false);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.update-sheet__title')?.textContent).toContain('You are on v1');
    expect(el.querySelector('.update-sheet__release')?.textContent).toContain('2026-08-31');
    expect(el.querySelectorAll('.update-card').length).toBe(2);
    expect(el.querySelectorAll('.update-card__icon').length).toBe(2);
    expect(el.querySelectorAll('.update-sheet__dot').length).toBe(2);
    expect(el.querySelector('app-primary-button')).toBeTruthy();
  });

  it('uses dialog element for showModal', () => {
    const fixture = TestBed.createComponent(UpdateModal);
    fixture.componentRef.setInput('lines', []);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog.update-sheet')).toBeTruthy();
  });
});
