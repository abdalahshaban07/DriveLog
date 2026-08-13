import { Component, inject, input, output } from '@angular/core';
import { I18n } from '../i18n/i18n';

@Component({
  selector: 'app-page-header',
  templateUrl: './page-header.html',
  styleUrl: './page-header.scss',
})
export class PageHeader {
  readonly i18n = inject(I18n);
  readonly title = input.required<string>();
  readonly eyebrow = input('');
  readonly subtitle = input('');
  readonly showBack = input(false);
  readonly back = output<void>();
}
