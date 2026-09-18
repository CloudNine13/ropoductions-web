import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LANG_COOKIE_NAME,
  LANG_COOKIE_MAX_AGE,
  LOCALES,
  getMessages,
  getStoredLocale,
  setStoredLocale,
  deepMerge,
} from "../src/lib/i18n-config";
import type { Messages } from "../src/lib/i18n-config";
import requestConfig from "../src/i18n/request";
import { getTranslations } from "next-intl/server";
import { setMockCookies } from "./helpers/next-headers-shim.mjs";

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

describe("i18n-config contract", () => {
  it("exports supported locales and cookie constants", () => {
    assert.deepEqual([...SUPPORTED_LOCALES].sort(), [...EXPECTED_LOCALES].sort());
    assert.equal(DEFAULT_LOCALE, "en");
    assert.equal(LANG_COOKIE_NAME, "ropoductions_lang");
    assert.equal(LANG_COOKIE_MAX_AGE, 365 * 24 * 60 * 60);

    for (const loc of EXPECTED_LOCALES) {
      assert.ok(LOCALES[loc as keyof typeof LOCALES]);
      assert.ok(LOCALES[loc as keyof typeof LOCALES].name);
      assert.ok(LOCALES[loc as keyof typeof LOCALES].nativeName);
    }
  });

  it("getMessages returns complete message dictionaries with English fallback", () => {
    for (const loc of EXPECTED_LOCALES) {
      const msgs = getMessages(loc as "en");
      assert.ok(msgs.game);
      assert.ok(msgs.game.title);
      assert.ok(msgs.game.returnToPortal);
      assert.ok(msgs.ageGate);
      assert.ok(msgs.paywall);
    }
  });
  it("memoizes merged dictionaries across calls", () => {
    assert.equal(getMessages("ja"), getMessages("ja"));
    assert.equal(getMessages("en"), getMessages("en"));
  });

  it("guards deepMerge against prototype pollution and prototype traversal", () => {
    const malicious = JSON.parse(
      '{"__proto__": {"polluted": true}, "constructor": {"prototype": {"admin": true}}, "title": "safe"}'
    );
    const result = deepMerge({ title: "base" }, malicious);
    assert.equal((result as Record<string, unknown>).polluted, undefined);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    assert.equal((result as Record<string, unknown>).title, "safe");
  });


  it("handles stored locale cookies with document fallback", () => {

    const origDoc = (globalThis as Record<string, unknown>).document;
    const origWin = (globalThis as Record<string, unknown>).window;
    try {
      delete (globalThis as Record<string, unknown>).document;
      assert.equal(getStoredLocale(), "en");

      const store: Record<string, string> = {};
      (globalThis as Record<string, unknown>).document = {
        get cookie() {
          return Object.entries(store).map(([k, v]) => `${k}=${v}`).join("; ");
        },
        set cookie(val: string) {
          const [pair] = val.split(";");
          const [k, v] = pair.split("=");
          store[k] = v;
        },
      };
      (globalThis as Record<string, unknown>).window = { location: { protocol: "https:" } };

      assert.equal(getStoredLocale(), "en");
      setStoredLocale("ja");
      assert.equal(getStoredLocale(), "ja");

      store.ropoductions_lang = "invalid_locale";
      assert.equal(getStoredLocale(), "en");
    } finally {
      (globalThis as Record<string, unknown>).document = origDoc;
      (globalThis as Record<string, unknown>).window = origWin;
    }
  });
});

describe("next-intl server request configuration contract", () => {
  it("resolves default locale and messages when cookie is absent", async () => {
    setMockCookies({});
    const config = await requestConfig({ requestLocale: Promise.resolve("en") });
    const messages = config.messages as Messages;
    assert.equal(config.locale, "en");
    assert.ok(messages);
    assert.equal(messages.game.title, "Final Orginity: Chapter 1");
  });

  it("resolves requested locale from ropoductions_lang cookie", async () => {
    setMockCookies({ ropoductions_lang: "ja" });
    const config = await requestConfig({ requestLocale: Promise.resolve("ja") });
    const messages = config.messages as Messages;
    assert.equal(config.locale, "ja");
    assert.ok(messages);
    assert.equal(messages.game.title, "Final Orginity: 第1章");
    assert.equal(messages.game.returnToPortal, "スタジオポータルに戻る");
  });

  it("normalizes RFC 6265 quoted ropoductions_lang cookies", async () => {
    setMockCookies({ ropoductions_lang: '"ja"' });
    const config = await requestConfig({ requestLocale: Promise.resolve(undefined) });
    const messages = config.messages as Messages;
    assert.equal(config.locale, "ja");
    assert.ok(messages);
    assert.equal(messages.game.title, "Final Orginity: 第1章");
  });

  it("prioritizes explicit requestLocale parameter over cookie", async () => {
    setMockCookies({ ropoductions_lang: "pl" });
    const config = await requestConfig({ requestLocale: Promise.resolve("es") });
    const messages = config.messages as Messages;
    assert.equal(config.locale, "es");
    assert.ok(messages);
    assert.equal(messages.game.title, "Final Orginity: Capítulo 1");
  });

  it("falls back to default locale on invalid ropoductions_lang cookie", async () => {
    setMockCookies({ ropoductions_lang: "nonexistent_lang" });
    const config = await requestConfig({ requestLocale: Promise.resolve("en") });
    const messages = config.messages as Messages;
    assert.equal(config.locale, "en");
    assert.ok(messages);
    assert.equal(messages.game.title, "Final Orginity: Chapter 1");
  });

  it("resolves getTranslations(game) in Server Components via request config", async () => {
    setMockCookies({ ropoductions_lang: "pl" });
    const t = await getTranslations("game");
    assert.equal(t("title"), "Final Orginity: Rozdział 1");
    assert.equal(t("returnToPortal"), "Wróć do portalu studia");
  });
});
