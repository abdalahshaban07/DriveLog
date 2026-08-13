import { Component, inject, output } from '@angular/core';
import { I18n } from '../i18n/i18n';

@Component({
  selector: 'app-pump-keypad',
  templateUrl: './pump-keypad.html',
  styleUrl: './pump-keypad.scss',
})
export class PumpKeypad {
  readonly i18n = inject(I18n);
  readonly keyed = output<string>();

  readonly keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.', 'back'] as const;

  press(key: string): void {
    this.keyed.emit(key);
  }

  display(key: string): string {
    return key === '.' ? '·' : key;
  }

  ariaFor(key: string): string {
    switch (key) {
      case 'back':
        return this.i18n.t('keypad.backspace');
      case '.':
        return this.i18n.t('keypad.decimal');
      default:
        return key;
    }
  }
}
