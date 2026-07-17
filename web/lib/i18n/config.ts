import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { supportedLocales } from './locales';
import { defaultLocale } from './types';

// If the app-level i18n (web/i18n/init.ts) already initialized the singleton,
// don't re-initialize — that would override keySeparator/defaultNS and break
// flat-key lookups used throughout the app.
if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .use(resourcesToBackend((language: string) => import(`./locales/${language}.json`)))
    .init({
      lng: defaultLocale,
      fallbackLng: defaultLocale,
      supportedLngs: supportedLocales.map((l) => l.code),
      interpolation: {
        escapeValue: false,
      },
    });
}

export default i18n;
