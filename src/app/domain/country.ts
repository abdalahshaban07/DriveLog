/** Currency → ISO-3166 alpha-2. ME-first; default EG. */
const CURRENCY_COUNTRY: Record<string, string> = {
  EGP: 'EG',
  SAR: 'SA',
  AED: 'AE',
  QAR: 'QA',
  KWD: 'KW',
  BHD: 'BH',
  OMR: 'OM',
  JOD: 'JO',
  LBP: 'LB',
  IQD: 'IQ',
  MAD: 'MA',
  TND: 'TN',
  DZD: 'DZ',
  LYD: 'LY',
  SDG: 'SD',
  TRY: 'TR',
  USD: 'US',
  EUR: 'DE',
  GBP: 'GB',
};

export function countryFromCurrency(currency: string): string {
  return CURRENCY_COUNTRY[currency.toUpperCase()] ?? 'EG';
}
