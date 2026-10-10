import { Component, input, model, output } from '@angular/core';

@Component({
  selector: 'app-text-field',
  templateUrl: './text-field.html',
})
export class TextField {
  readonly label = input.required<string>();
  readonly value = model('');
  readonly type = input('text');
  readonly multiline = input(false);
  readonly error = input('');
  readonly touch = output<void>();
  readonly errorId = `txt-err-${Math.random().toString(36).slice(2, 8)}`;

  onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement | HTMLTextAreaElement).value);
  }
}
