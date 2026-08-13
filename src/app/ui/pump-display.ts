import { Component, input, output } from '@angular/core';

export type PumpKind = 'odometer' | 'liters' | 'cost';

@Component({
  selector: 'app-pump-display',
  templateUrl: './pump-display.html',
  styleUrl: './pump-display.scss',
})
export class PumpDisplay {
  readonly label = input.required<string>();
  readonly kind = input.required<PumpKind>();
  readonly value = input('');
  readonly hint = input('');
  readonly active = input(false);
  readonly selected = output<void>();
}
