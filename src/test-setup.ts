import { en } from './app/i18n/en';
import { primeEnglishTable } from './app/i18n/i18n';

// Specs read English strings synchronously; production loads them lazily.
primeEnglishTable(en);
