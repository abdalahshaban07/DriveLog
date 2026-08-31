import {
  Component,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { todayDateOnly } from '../domain/dues';
import { I18n } from '../i18n/i18n';

/** Local YYYY-MM-DD — never Date.toISOString() (UTC can shift the day). */
export function toDateOnly(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

type WeekInfo = { firstDay: number };

/** 0=Sun … 6=Sat. Prefers locale weekInfo; else ar → Saturday, en → Sunday. */
export function weekStartDay(locale: string, lang: 'en' | 'ar'): number {
  const loc = new Intl.Locale(locale) as Intl.Locale & {
    weekInfo?: WeekInfo;
    getWeekInfo?: () => WeekInfo;
  };
  const info = loc.weekInfo ?? loc.getWeekInfo?.();
  if (info) {
    const d = info.firstDay;
    return d === 7 || d === 0 ? 0 : d;
  }
  return lang === 'ar' ? 6 : 0;
}

export function weekdayLabels(locale: string, weekStart: number): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const sun = new Date(2024, 0, 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sun);
    d.setDate(sun.getDate() + ((weekStart + i) % 7));
    return fmt.format(d);
  });
}

export type DateFieldMode = 'record' | 'due';

export function yearOptionsForMode(
  mode: DateFieldMode,
  currentYear: number,
  selectedDate = '',
): number[] {
  const min = currentYear - 50;
  const max = mode === 'due' ? currentYear + 20 : currentYear;
  const years = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  if (/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    const y = Number(selectedDate.slice(0, 4));
    if (y < min || y > max) {
      years.push(y);
      years.sort((a, b) => a - b);
    }
  }
  return years;
}

export function monthLabels(locale: string): { value: number; label: string }[] {
  const fmt = new Intl.DateTimeFormat(locale, { month: 'long' });
  return Array.from({ length: 12 }, (_, i) => ({
    value: i,
    label: fmt.format(new Date(2024, i, 1)),
  }));
}

export function monthCells(
  year: number,
  monthIndex: number,
  weekStart: number,
): (number | null)[] {
  const lead = (new Date(year, monthIndex, 1).getDay() - weekStart + 7) % 7;
  const days = new Date(year, monthIndex + 1, 0).getDate();
  return [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
}

@Component({
  selector: 'app-date-field',
  templateUrl: './date-field.html',
  styleUrl: './date-field.scss',
  host: {
    '(keydown)': 'onKey($event)',
  },
})
export class DateField {
  readonly i18n = inject(I18n);
  readonly label = input.required<string>();
  readonly value = model('');
  readonly mode = input<DateFieldMode>('record');
  readonly error = input('');
  readonly hint = input('');

  readonly opened = signal(false);
  readonly viewY = signal(new Date().getFullYear());
  readonly viewM = signal(new Date().getMonth());

  private readonly uid = crypto.randomUUID().slice(0, 8);
  readonly inputId = `date-${this.uid}`;
  readonly calId = `date-cal-${this.uid}`;
  readonly monthSelectId = `date-month-${this.uid}`;
  readonly yearSelectId = `date-year-${this.uid}`;
  readonly errorId = `date-err-${this.uid}`;
  readonly hintId = `date-hint-${this.uid}`;

  readonly locale = computed(() =>
    this.i18n.language() === 'ar' ? 'ar-EG' : 'en-US',
  );
  readonly weekStart = computed(() =>
    weekStartDay(this.locale(), this.i18n.language()),
  );
  readonly weekdays = computed(() =>
    weekdayLabels(this.locale(), this.weekStart()),
  );
  readonly cells = computed(() =>
    monthCells(this.viewY(), this.viewM(), this.weekStart()),
  );
  readonly yearOptions = computed(() =>
    yearOptionsForMode(
      this.mode(),
      new Date().getFullYear(),
      this.value(),
    ),
  );
  readonly monthOptions = computed(() => monthLabels(this.locale()));
  readonly dayLabels = computed(() => {
    const fmt = new Intl.DateTimeFormat(this.locale(), { day: 'numeric' });
    const y = this.viewY();
    const m = this.viewM();
    const n = new Date(y, m + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => fmt.format(new Date(y, m, i + 1)));
  });
  readonly describedBy = computed(() => {
    const ids = [
      this.hint() ? this.hintId : '',
      this.error() ? this.errorId : '',
    ].filter(Boolean);
    return ids.length ? ids.join(' ') : null;
  });

  onChange(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }

  onInputClick(event: Event): void {
    event.preventDefault();
    this.open();
  }

  onInputKey(event: KeyboardEvent): void {
    if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      this.open();
    }
  }

  onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.opened()) {
      return;
    }
    event.preventDefault();
    this.close();
  }

  open(): void {
    const v = this.value();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      this.viewY.set(Number(v.slice(0, 4)));
      this.viewM.set(Number(v.slice(5, 7)) - 1);
    } else {
      const t = todayDateOnly();
      this.viewY.set(Number(t.slice(0, 4)));
      this.viewM.set(Number(t.slice(5, 7)) - 1);
    }
    this.opened.set(true);
  }

  close(): void {
    this.opened.set(false);
  }

  toggle(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.opened()) {
      this.close();
      return;
    }
    this.open();
  }

  onMonthChange(event: Event): void {
    this.viewM.set(Number((event.target as HTMLSelectElement).value));
  }

  onYearChange(event: Event): void {
    this.viewY.set(Number((event.target as HTMLSelectElement).value));
  }

  pick(day: number): void {
    this.value.set(toDateOnly(this.viewY(), this.viewM(), day));
    this.close();
  }

  today(): void {
    this.value.set(todayDateOnly());
    this.close();
  }

  clear(): void {
    this.value.set('');
    this.close();
  }

  isSelected(day: number): boolean {
    return this.value() === toDateOnly(this.viewY(), this.viewM(), day);
  }

  isToday(day: number): boolean {
    return todayDateOnly() === toDateOnly(this.viewY(), this.viewM(), day);
  }
}
