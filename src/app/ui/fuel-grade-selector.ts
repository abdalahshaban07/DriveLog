import { ChangeDetectionStrategy, Component, inject, input, model } from '@angular/core';
import type { FuelGrade } from '../domain/models';
import type { CountryFuelPrices } from '../data/remote';
import { priceForGrade } from '../domain/fill-up-cost';
import { I18n } from '../i18n/i18n';
import type { MsgKey } from '../i18n/en';

type GradeOption = { grade: FuelGrade; labelKey: MsgKey; price: number | null };

@Component({
  selector: 'app-fuel-grade-selector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="grades">
      <legend class="label">{{ i18n.t('fillUp.fuelType') }}</legend>
      <div class="grades__rail" role="radiogroup" [attr.aria-label]="i18n.t('fillUp.fuelType')">
        @for (opt of options(); track opt.grade) {
          <button
            type="button"
            role="radio"
            class="grades__chip"
            [class.grades__chip--on]="value() === opt.grade"
            [attr.aria-checked]="value() === opt.grade"
            (click)="value.set(opt.grade)"
          >
            <span class="grades__name">{{ i18n.t(opt.labelKey) }}</span>
            @if (opt.price != null) {
              <span class="grades__price">{{ formatPrice(opt.price) }}</span>
            }
          </button>
        }
        @if (fallbackPrice() != null && !options().length) {
          <button
            type="button"
            role="radio"
            class="grades__chip grades__chip--on"
            aria-checked="true"
            (click)="value.set('custom')"
          >
            <span class="grades__name">{{ i18n.t('fillUp.lastPaid') }}</span>
            <span class="grades__price">{{ formatPrice(fallbackPrice()!) }}</span>
          </button>
        }
      </div>
    </fieldset>
  `,
  styles: `
    .grades {
      border: 0;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-2);
    }
    .grades__rail {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(0, 1fr);
      gap: var(--space-2);
    }
    .grades__chip {
      display: grid;
      align-content: center;
      gap: 2px;
      min-width: 0;
      min-height: var(--tap);
      padding: var(--space-2) var(--space-2);
      border: 1px solid var(--hairline);
      border-radius: calc(var(--radius) - 2px);
      background: var(--fill-well);
      color: var(--text);
      text-align: center;
      cursor: pointer;
      transition:
        border-color 80ms var(--ease-out),
        background 80ms var(--ease-out);
    }
    .grades__chip--on {
      border-color: var(--fuel);
      background: color-mix(in srgb, var(--fuel) 14%, var(--well));
      box-shadow: inset 0 0 0 1px var(--fuel);
    }
    .grades__chip:active {
      transform: scale(0.98);
    }
    .grades__name {
      font-weight: 700;
      font-size: 1rem;
      letter-spacing: -0.02em;
    }
    .grades__chip--on .grades__name {
      color: var(--fuel);
    }
    .grades__price {
      font-variant-numeric: tabular-nums;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--muted);
    }
    @media (prefers-reduced-motion: reduce) {
      .grades__chip:active {
        transform: none;
      }
    }
  `,
})
export class FuelGradeSelector {
  readonly i18n = inject(I18n);
  readonly prices = input<CountryFuelPrices | null>(null);
  readonly fallbackPrice = input<number | null>(null);
  readonly value = model<FuelGrade | null>(null);

  readonly options = input<GradeOption[]>([]);

  formatPrice(value: number): string {
    return this.i18n.formatUnit(value, 'common.perLiter', 2);
  }
}

/** Always list grades so fill-up works offline; price may be null. */
export function buildGradeOptions(
  prices: CountryFuelPrices | null,
  i18nKeys: Record<FuelGrade, MsgKey>,
): GradeOption[] {
  // ponytail: diesel kept on FuelGrade for legacy fills; solar is the selectable diesel-grade
  const grades: FuelGrade[] = ['gasoline92', 'gasoline95', 'solar'];
  return grades.map((grade) => ({
    grade,
    labelKey: i18nKeys[grade],
    price: priceForGrade(prices, grade),
  }));
}
