import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, required, submit, validate } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { DEFAULT_CURRENCY, DEFAULT_LANGUAGE } from '../../core/config';
import { Db } from '../../data/db';
import { decodeVin, recallsFor } from '../../data/remote';
import { listCurrencyOptions, validCurrency } from '../../domain/currencies';
import { isValidVin, normalizeVin } from '../../domain/vin';
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

  readonly language = signal<'en' | 'ar'>(DEFAULT_LANGUAGE);
  readonly currency = signal(DEFAULT_CURRENCY);
  readonly vin = signal('');
  readonly vinBusy = signal(false);
  readonly vinError = signal('');
  readonly vinInfo = signal<{
    year?: string;
    make?: string;
    model?: string;
    recallCount?: number;
  } | null>(null);
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
  }

  readonly langOptions = computed(() => [
    { value: 'en', label: this.i18n.t('settings.lang.en') },
    { value: 'ar', label: this.i18n.t('settings.lang.ar') },
  ]);

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

  async onLang(value: string): Promise<void> {
    const lang = value === 'ar' ? 'ar' : 'en';
    this.language.set(lang);
    await this.i18n.setLanguage(lang);
  }

  async decode(): Promise<void> {
    const v = normalizeVin(this.vin());
    this.vin.set(v);
    this.vinError.set('');
    this.vinInfo.set(null);
    if (!v) {
      return;
    }
    if (!isValidVin(v)) {
      this.vinError.set(this.i18n.t('vin.invalid'));
      return;
    }
    this.vinBusy.set(true);
    try {
      const decoded = await decodeVin(v);
      if (!decoded) {
        this.vinError.set(this.i18n.t('vin.failed'));
        return;
      }
      let recallCount: number | undefined;
      if (decoded.make && decoded.model && decoded.year) {
        const n = await recallsFor(decoded.make, decoded.model, decoded.year);
        recallCount = n ?? undefined;
      }
      this.vinInfo.set({
        year: decoded.year,
        make: decoded.make,
        model: decoded.model,
        recallCount,
      });
    } finally {
      this.vinBusy.set(false);
    }
  }

  async submit(): Promise<void> {
    await submit(this.setupForm, async () => {
      const { nickname, odometer } = this.setupModel();
      await this.db.updateSettings({
        language: this.language(),
        currency: validCurrency(this.currency()),
      });
      const info = this.vinInfo();
      const v = normalizeVin(this.vin());
      await this.db.createCar(nickname.trim(), Number(odometer), {
        vin: v || undefined,
        year: info?.year,
        make: info?.make,
        model: info?.model,
        recallCount: info?.recallCount,
      });
      await this.router.navigateByUrl('/');
    });
  }
}
