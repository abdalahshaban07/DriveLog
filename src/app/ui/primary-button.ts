import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-primary-button',
  templateUrl: './primary-button.html',
  styleUrl: './primary-button.scss',
})
export class PrimaryButton {
  readonly label = input.required<string>();
  readonly disabled = input(false);
  readonly pressed = output<void>();
}
