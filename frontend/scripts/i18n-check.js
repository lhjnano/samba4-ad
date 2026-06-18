/**
 * i18n-check.js — GNU gettext-style translation completeness validator.
 *
 * Equivalent to `msgfmt --check` in the GNU gettext toolchain.
 * Verifies that every key in en.json has a non-empty translation in ko.json.
 *
 * Exit codes:
 *   0 — all keys translated
 *   1 — missing translations found (CI failure)
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, "..", "src", "i18n", "locales");

const en = JSON.parse(readFileSync(join(localesDir, "en.json"), "utf-8"));
const ko = JSON.parse(readFileSync(join(localesDir, "ko.json"), "utf-8"));

/**
 * Recursively collect all leaf key paths from a nested object.
 * Returns array of dot-separated paths like "users:label_name"
 */
function collectKeys(obj, prefix = "") {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...collectKeys(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

/**
 * Get value at a dot-separated path in a nested object.
 */
function getValue(obj, path) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

const enKeys = collectKeys(en);
const missing = [];
const empty = [];

for (const key of enKeys) {
  const enVal = getValue(en, key);
  const koVal = getValue(ko, key);

  if (koVal === undefined) {
    missing.push(key);
  } else if (typeof koVal === "string" && koVal.trim() === "" && typeof enVal === "string" && enVal.trim() !== "") {
    empty.push(key);
  }
}

// Also check for keys in ko.json that don't exist in en.json (stale)
const koKeys = collectKeys(ko);
const stale = koKeys.filter((k) => getValue(en, k) === undefined);

const hasErrors = missing.length > 0 || empty.length > 0 || stale.length > 0;

if (missing.length > 0) {
  console.error(`\n❌ Missing translations in ko.json (${missing.length} keys):`);
  for (const k of missing.slice(0, 20)) console.error(`   ${k}`);
  if (missing.length > 20) console.error(`   ... and ${missing.length - 20} more`);
}

if (empty.length > 0) {
  console.error(`\n⚠️  Empty translations in ko.json (${empty.length} keys):`);
  for (const k of empty.slice(0, 20)) console.error(`   ${k}`);
  if (empty.length > 20) console.error(`   ... and ${empty.length - 20} more`);
}

if (stale.length > 0) {
  console.error(`\n🗑️  Stale keys in ko.json (not in en.json) (${stale.length} keys):`);
  for (const k of stale.slice(0, 10)) console.error(`   ${k}`);
  if (stale.length > 10) console.error(`   ... and ${stale.length - 10} more`);
}

if (!hasErrors) {
  console.log(`✅ All ${enKeys.length} keys translated (en → ko)`);
  process.exit(0);
} else {
  console.error(`\n📊 Summary: ${enKeys.length} total keys, ${missing.length} missing, ${empty.length} empty, ${stale.length} stale`);
  process.exit(1);
}
