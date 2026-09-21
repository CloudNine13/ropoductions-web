import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `_`-prefixed bindings signal intentionally-unused values
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  globalIgnores([
    // eslint-config-next default ignores (globalIgnores replaces them)
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "cloudflare-env.d.ts",
    // OpenNext Cloudflare build output
    ".open-next/**",
    // Wrangler working state: the e2e harness runs `wrangler`/`opennextjs-cloudflare`
    // preview, which leaves bundled worker output under .wrangler/tmp
    ".wrangler/**",
    // The in-engine bridge plugin and mock harness run in a foreign RPG Maker
    // MZ runtime (MZ globals), not the Next.js app
    "src/engine-plugins/**",
  ]),
]);
