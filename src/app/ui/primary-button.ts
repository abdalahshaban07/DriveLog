import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-primary-button',
  templateUrl: './primary-button.html',
  styleUrl: './primary-button.scss',
  host: {
    '[class.stretch]': 'stretch()',
  },
})
export class PrimaryButton {
  readonly label = input.required<string>();
  readonly disabled = input(false);
  readonly stretch = input(false);
  readonly tone = input<'fuel' | 'mint'>('fuel');
  readonly pressed = output<void>();
}
