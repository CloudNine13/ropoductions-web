import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const localesDir = join(dirname(fileURLToPath(import.meta.url)), "../src/locales");
const EXPECTED_LOCALES = ["en", "es", "ja", "pl", "ru", "zh"];

type Dict = Record<string, unknown>;

function load(locale: string): Dict {
  return JSON.parse(readFileSync(join(localesDir, `${locale}.json`), "utf8"));
}

function leafKeys(dict: Dict, prefix = ""): string[] {
  return Object.entries(dict).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? leafKeys(value as Dict, path)
      : [path];
  });
}

function leafValues(dict: Dict): unknown[] {
  return Object.values(dict).flatMap((value) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? leafValues(value as Dict)
      : [value]
  );
}

function getPath(dict: Dict, path: string): unknown {
  return path.split(".").reduce<unknown>((curr, part) => {
    if (!curr || typeof curr !== "object") return undefined;
    return (curr as Dict)[part];
  }, dict);
}

describe("multilingual shell entry point", () => {
  it("ships exactly the six supported locale dictionaries", () => {
    const shipped = readdirSync(localesDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    assert.deepEqual(shipped, [...EXPECTED_LOCALES].sort());
  });

  it("keeps every locale on the same namespace contract as English", () => {
    const baseNamespaces = Object.keys(load("en")).sort();
    for (const locale of EXPECTED_LOCALES) {
      assert.deepEqual(Object.keys(load(locale)).sort(), baseNamespaces, locale);
    }
  });

  it("leaves no English leaf key untranslated so fallback stays silent", () => {
    const baseKeys = new Set(leafKeys(load("en")));
    for (const locale of EXPECTED_LOCALES.filter((l) => l !== "en")) {
      const missing = leafKeys(load(locale)).filter((k) => !baseKeys.has(k));
      assert.deepEqual(missing, [], `${locale} has unexpected keys`);
      const absent = [...baseKeys].filter((k) => getPath(load(locale), k) === undefined);
      assert.deepEqual(absent, [], `${locale} is missing keys`);
    }
  });

  it("publishes no empty translation strings in any locale", () => {
    for (const locale of EXPECTED_LOCALES) {
      const empties = leafValues(load(locale)).filter((v) => v === "");
      assert.deepEqual(empties, [], `${locale} has empty strings`);
    }
  });

  it("renders the 21+ gate and language switcher in every locale", () => {
    for (const locale of EXPECTED_LOCALES) {
      const dict = load(locale);
      for (const key of [
        "ageGate.title",
        "ageGate.description",
        "ageGate.warning",
        "ageGate.confirmButton",
        "ageGate.exitButton",
        "ageGate.disclaimer",
        "language.select",
      ]) {
        const value = getPath(dict, key);
        assert.equal(typeof value, "string", `${locale}.${key}`);
        assert.ok((value as string).length > 0, `${locale}.${key} is blank`);
      }
      for (const code of EXPECTED_LOCALES) {
        assert.equal(typeof getPath(dict, `language.${code}`), "string", `${locale}.language.${code}`);
      }
    }
  });
});
