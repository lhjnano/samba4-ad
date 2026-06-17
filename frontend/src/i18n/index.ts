import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import ko from "./locales/ko.json";

export const LANGUAGES = {
  en: "English",
  ko: "한국어",
} as const;

export type Language = keyof typeof LANGUAGES;

// Split flat JSON into i18next namespaces
function toNamespaces(obj: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [ns, value] of Object.entries(obj)) {
    result[ns] = value;
  }
  return result;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: toNamespaces(en),
      ko: toNamespaces(ko),
    },
    fallbackLng: "en",
    supportedLngs: ["en", "ko"],
    defaultNS: "common",
    ns: ["common", "setup", "dashboard", "users", "groups", "computers", "ous", "gpos", "dns", "policies", "logs", "settings", "api"],
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "lang",
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
  } as any);

export default i18n;
