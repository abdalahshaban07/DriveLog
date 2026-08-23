/** Keep in sync with core DEFAULT_CURRENCY. Domain must not import app/. */
const DEFAULT_CURRENCY = 'EGP';

/** ponytail: no FX API/package; names from Intl. DisplayNames. Expand FALLBACK if a market is missing. */
const FALLBACK = [
  'EGP',
  'SAR',
  'AED',
  'QAR',
  'KWD',
  'BHD',
  'OMR',
  'JOD',
  'LBP',
  'IQD',
  'MAD',
  'TND',
  'DZD',
  'LYD',
  'SDG',
  'USD',
  'EUR',
  'GBP',
  'CHF',
  'TRY',
  'ILS',
  'PKR',
  'INR',
  'BDT',
  'CNY',
  'JPY',
  'KRW',
  'AUD',
  'CAD',
  'NZD',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'BRL',
  'MXN',
  'ZAR',
  'NGN',
  'KES',
  'RUB',
] as const;

export type CurrencyOption = { value: string; label: string };

export type RestCurrencyMeta = { code: string; name: string; flag: string };

function intlCodes(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?(key: 'currency'): string[];
  };
  try {
    return intl.supportedValuesOf?.('currency')?.slice() ?? [];
  } catch {
    return [];
  }
}

export function validCurrency(code: string): string {
  const current = code.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(current) ? current : DEFAULT_CURRENCY;
}

export function currencyLabel(
  code: string,
  lang: 'en' | 'ar',
  rest?: RestCurrencyMeta | null,
): string {
  if (rest) {
    return `${rest.flag} ${code} · ${rest.name}`;
  }
  try {
    const name = new Intl.DisplayNames([lang], { type: 'currency' }).of(code);
    return name && name !== code ? `${code} · ${name}` : code;
  } catch {
    return code;
  }
}

export function listCurrencyOptions(
  lang: 'en' | 'ar',
  selected = DEFAULT_CURRENCY,
  restList: readonly RestCurrencyMeta[] = [],
): CurrencyOption[] {
  const fromIntl = intlCodes();
  const codes = new Set(fromIntl.length ? fromIntl : FALLBACK);
  const current = selected.trim().toUpperCase() || DEFAULT_CURRENCY;
  codes.add(current);
  codes.add(DEFAULT_CURRENCY);
  const restByCode = new Map(restList.map((r) => [r.code, r]));

  const list: CurrencyOption[] = [...codes]
    .filter((code) => /^[A-Z]{3}$/.test(code))
    .map((value) => ({
      value,
      label: currencyLabel(value, lang, restByCode.get(value) ?? null),
    }));

  list.sort((a, b) => {
    if (a.value === DEFAULT_CURRENCY) {
      return -1;
    }
    if (b.value === DEFAULT_CURRENCY) {
      return 1;
    }
    return a.label.localeCompare(b.label, lang);
  });
  return list;
}
