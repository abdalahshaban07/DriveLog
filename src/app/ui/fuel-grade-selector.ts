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
      display: flex;
      gap: var(--space-2);
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      padding-block: 2px;
      -webkit-overflow-scrolling: touch;
    }
    .grades__chip {
      flex: 0 0 auto;
      scroll-snap-align: start;
      display: grid;
      gap: 2px;
      min-width: 5.5rem;
      min-height: calc(var(--tap) - 12px);
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--hairline);
      border-radius: calc(var(--radius) - 4px);
      background: var(--well);
      color: var(--text);
      text-align: center;
      cursor: pointer;
      transition:
        border-color 80ms var(--ease-out),
        background 80ms var(--ease-out);
    }
    .grades__chip--on {
      border-color: color-mix(in srgb, var(--fuel) 55%, var(--hairline));
      background: color-mix(in srgb, var(--fuel) 12%, var(--well));
    }
    .grades__chip:active {
      transform: scale(0.97);
    }
    .grades__name {
      font-weight: 700;
      font-size: 0.9rem;
    }
    .grades__price {
      font-variant-numeric: tabular-nums;
      font-size: 0.8rem;
      color: var(--muted);
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
    try {
      return `${new Intl.NumberFormat(this.i18n.language(), { maximumFractionDigits: 2 }).format(value)}/L`;
    } catch {
      return `${value.toFixed(2)}/L`;
    }
  }
}

export function buildGradeOptions(
  prices: CountryFuelPrices | null,
  i18nKeys: Record<FuelGrade, MsgKey>,
): GradeOption[] {
  const grades: FuelGrade[] = ['gasoline92', 'gasoline95', 'diesel', 'solar'];
  const out: GradeOption[] = [];
  for (const grade of grades) {
    const price = priceForGrade(prices, grade);
    if (price != null) {
      out.push({ grade, labelKey: i18nKeys[grade], price });
    }
  }
  return out;
}
