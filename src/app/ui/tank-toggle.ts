import { Component, input, model } from '@angular/core';

@Component({
  selector: 'app-tank-toggle',
  templateUrl: './tank-toggle.html',
  styleUrl: './tank-toggle.scss',
})
export class TankToggle {
  readonly value = model(true);
  readonly onLabel = input.required<string>();
  readonly offLabel = input.required<string>();
}
