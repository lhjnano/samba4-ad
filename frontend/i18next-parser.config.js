/**
 * i18next-parser — GNU gettext-style automated extraction config.
 *
 * Scans all .tsx/.ts source files for t("namespace:key") calls and
 * merges them into locale JSON files. Missing keys are appended;
 * existing translations are preserved.
 *
 * Workflow (GNU gettext equivalent):
 *   1. npm run i18n:extract  →  xgettext (extract strings from source)
 *   2. Translate new keys in ko.json  →  .po editing
 *   3. npm run i18n:check     →  msgfmt --check (verify completeness)
 */
module.exports = {
  // Source files to scan
  input: ["src/**/*.{ts,tsx}"],

  // Output directory and file pattern
  output: "src/i18n/locales/$LOCALE.json",

  // Supported locales
  locales: ["en", "ko"],

  // Default namespace (used when t("key") without "namespace:" prefix)
  defaultNamespace: "common",

  // Preserve existing translations; only add missing keys
  createOldCatalogs: false,

  // Keep keys sorted for clean diffs
  sort: true,

  // Add a comment for new (untranslated) keys
  keySeparator: ".",
  namespaceSeparator: ":",

  // Verbose output
  verbose: true,

  // Custom value for new keys (empty string = needs translation)
  defaultValue: (locale, namespace, key) => {
    // English is the source language — use the key path as default value
    if (locale === "en") return key.replace(/^(.+):/, "");
    // Other locales: empty string signals "needs translation"
    return "";
  },

  // Indentation
  indentation: 2,
};
