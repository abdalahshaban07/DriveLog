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

  it('renders a numbered ledger with facts, and body when a note has none', () => {
    const fixture = TestBed.createComponent(UpdateModal);
    fixture.componentRef.setInput('title', 'You are on v1');
    fixture.componentRef.setInput('cards', [
      {
        icon: 'fuel' as const,
        kicker: 'Health',
        title: 'Fuel',
        body: 'Feature one',
        points: ['Glance counts', 'Richer rows'],
      },
      {
        icon: 'chart' as const,
        kicker: '',
        title: 'Charts',
        body: 'Feature two',
        points: [],
      },
    ]);
    fixture.componentRef.setInput('releaseId', '2026-08-31');
    fixture.componentRef.setInput('isUpdate', false);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.update-sheet__title')?.textContent).toContain('You are on v1');
    expect(el.querySelector('.update-sheet__kicker')?.textContent).toContain('2026-08-31');
    expect(el.querySelector('.update-sheet__lead')?.textContent).toContain('update.notesLead');
    const items = el.querySelectorAll('.ledger__item');
    expect(items.length).toBe(2);
    expect(items[0]?.querySelector('.ledger__num')?.textContent).toBe('01');
    expect(items[0]?.querySelector('.ledger__kicker')?.textContent).toBe('Health');
    expect(items[0]?.querySelectorAll('.ledger__facts li').length).toBe(2);
    expect(items[0]?.querySelector('.ledger__body')).toBeNull();
    expect(items[1]?.querySelector('.ledger__num')?.textContent).toBe('02');
    expect(items[1]?.querySelector('.ledger__body')?.textContent).toContain('Feature two');
    expect(el.querySelector('app-primary-button')).toBeTruthy();
  });

  it('uses dialog element for showModal', () => {
    const fixture = TestBed.createComponent(UpdateModal);
    fixture.componentRef.setInput('lines', []);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog.update-sheet')).toBeTruthy();
  });
});
