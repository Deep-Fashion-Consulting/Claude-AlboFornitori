import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { it } from './it';

void i18n.use(initReactI18next).init({
  resources: { it: { translation: it }, en: { translation: en } },
  lng: 'it',
  fallbackLng: 'it',
  interpolation: { escapeValue: false },
});

export default i18n;

/** Date ISO (AAAA-MM-GG o timestamp) nel formato della lingua corrente */
export function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return '—';
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'it-IT', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(date);
}
