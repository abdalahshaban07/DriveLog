import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, required, submit, validate } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { DEFAULT_CURRENCY, DEFAULT_LANGUAGE, DEFAULT_THEME } from '../../core/config';
import { Db } from '../../data/db';
import { detectCountryCurrency } from '../../data/remote';
import { listCurrencyOptions, validCurrency } from '../../domain/currencies';
import { THEMES, type Theme } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import { NumericField } from '../../ui/numeric-field';
import { PageHeader } from '../../ui/page-header';
import { PrimaryButton } from '../../ui/primary-button';
import { SelectField } from '../../ui/select-field';
import { TextField } from '../../ui/text-field';

@Component({
  selector: 'app-first-run',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, PrimaryButton, NumericField, TextField, SelectField, FormField],
  templateUrl: './first-run.html',
  styleUrl: './first-run.scss',
})
export class FirstRunPage {
  readonly i18n = inject(I18n);
  private readonly db = inject(Db);
  private readonly router = inject(Router);

  readonly step = signal<1 | 2>(1);
  readonly language = signal<'en' | 'ar'>(DEFAULT_LANGUAGE);
  readonly theme = signal<Theme>(DEFAULT_THEME);
  readonly currency = signal(DEFAULT_CURRENCY);
  readonly setupModel = signal({ nickname: '', odometer: '' });
  readonly setupForm = form(this.setupModel, (p) => {
    required(p.nickname, { message: () => this.i18n.t('setup.err.nickname') });
    validate(p.nickname, ({ value }) => {
      const v = value();
      return !v || v.trim()
        ? undefined
        : { kind: 'required', message: this.i18n.t('setup.err.nickname') };
    });
    validate(p.odometer, ({ value }) => {
      const n = Number(value());
      return Number.isFinite(n) && n > 0
        ? undefined
        : { kind: 'min', message: this.i18n.t('setup.err.odometer') };
    });
  });

  constructor() {
    void this.i18n.setLanguage(DEFAULT_LANGUAGE);
    void this.detectCurrency();
  }

  readonly langOptions = computed(() => [
    { value: 'en', label: this.i18n.t('settings.lang.en') },
    { value: 'ar', label: this.i18n.t('settings.lang.ar') },
  ]);

  readonly themeOptions = computed(() =>
    THEMES.map((value) => ({
      value,
      label: this.i18n.t(`settings.theme.${value}`),
    })),
  );

  readonly currencyOptions = computed(() =>
    listCurrencyOptions(this.i18n.language(), this.currency()),
  );

  readonly canContinue = computed(() => this.setupForm().valid());

  readonly nickError = computed(() => {
    const f = this.setupForm.nickname();
    return f.touched() && f.invalid() ? this.i18n.t('setup.err.nickname') : '';
  });

  readonly odoError = computed(() => {
    const f = this.setupForm.odometer();
    return f.touched() && f.invalid() ? this.i18n.t('setup.err.odometer') : '';
  });

  async detectCurrency(): Promise<void> {
    const cc = await detectCountryCurrency();
    if (cc) {
      this.currency.set(validCurrency(cc));
    }
  }

  async onLang(value: string): Promise<void> {
    const lang = value === 'ar' ? 'ar' : 'en';
    this.language.set(lang);
    await this.i18n.setLanguage(lang);
  }

  onTheme(value: string): void {
    if ((THEMES as readonly string[]).includes(value)) {
      this.theme.set(value as Theme);
    }
  }

  goStep2(): void {
    if (!this.canContinue()) {
      return;
    }
    this.step.set(2);
  }

  backStep1(): void {
    this.step.set(1);
  }

  async submit(): Promise<void> {
    await submit(this.setupForm, async () => {
      const { nickname, odometer } = this.setupModel();
      await this.db.updateSettings({
        language: this.language(),
        theme: this.theme(),
        currency: validCurrency(this.currency()),
      });
      await this.db.createCar(nickname.trim(), Number(odometer));
      await this.router.navigateByUrl('/');
    });
  }
}
