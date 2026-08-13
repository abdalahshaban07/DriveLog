import { Component, input, model, output } from '@angular/core';

/** Keep digits and a single decimal point. */
export function sanitizeDecimal(raw: string): string {
  const next = raw.replace(/[^\d.]/g, '');
  const dot = next.indexOf('.');
  if (dot === -1) {
    return next;
  }
  return next.slice(0, dot + 1) + next.slice(dot + 1).replace(/\./g, '');
}

@Component({
  selector: 'app-numeric-field',
  templateUrl: './numeric-field.html',
})
export class NumericField {
  readonly label = input.required<string>();
  readonly value = model('');
  readonly error = input('');
  readonly touch = output<void>();
  readonly errorId = `err-${Math.random().toString(36).slice(2, 8)}`;

  onBeforeInput(event: InputEvent): void {
    if (event.data && /[^\d.]/.test(event.data)) {
      event.preventDefault();
    }
  }

  onInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    const cleaned = sanitizeDecimal(el.value);
    if (el.value !== cleaned) {
      el.value = cleaned;
    }
    this.value.set(cleaned);
  }
}
