import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { WhatsNewToast } from './whats-new-toast';
import { I18n } from '../i18n/i18n';

describe('WhatsNewToast', () => {
  it('shows version and a short found message', async () => {
    await TestBed.configureTestingModule({
      imports: [WhatsNewToast],
      providers: [
        {
          provide: I18n,
          useValue: { t: (k: string) => k, language: () => 'en' as const },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(WhatsNewToast);
    fixture.componentRef.setInput('version', 'v1.2');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('v1.2');
    expect(el.textContent).toContain('update.found');
    expect(el.textContent).toContain('update.foundBody');
    expect(el.querySelector('dialog.wn-toast')).toBeTruthy();
  });
});
