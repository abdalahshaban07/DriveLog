import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DueStatus } from '../domain/models';

@Component({
  selector: 'app-due-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './due-row.html',
  styleUrl: './due-row.scss',
})
export class DueRow {
  readonly title = input.required<string>();
  readonly meta = input('');
  readonly statusLabel = input('');
  readonly status = input<DueStatus>('future');
}
