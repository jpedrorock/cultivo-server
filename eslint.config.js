// ESLint flat config — TypeScript + React
// Foca em prevenir bugs reais (stale closures, hooks mal usados, vars não usadas).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  // Bases
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Ignores globais
  {
    ignores: [
      "dist/**",
      "build/**",
      "node_modules/**",
      "drizzle/**",
      "migrations/**",
      "client/public/**",
      "scripts/**",
      "*.config.js",
      "*.config.ts",
      // Capacitor build artifacts — minified JS gerado pelo Vite, não lint
      "android/**",
      "ios/**",
    ],
  },

  // Regras gerais (TS + React)
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        // Browser
        window: "readonly", document: "readonly", localStorage: "readonly",
        sessionStorage: "readonly", fetch: "readonly", FormData: "readonly",
        URL: "readonly", URLSearchParams: "readonly", navigator: "readonly",
        location: "readonly", console: "readonly", setTimeout: "readonly",
        clearTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly",
        requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly",
        ResizeObserver: "readonly", IntersectionObserver: "readonly",
        MutationObserver: "readonly", HTMLElement: "readonly",
        HTMLInputElement: "readonly", HTMLCanvasElement: "readonly",
        Image: "readonly", Blob: "readonly", File: "readonly",
        DOMRect: "readonly", Event: "readonly", KeyboardEvent: "readonly",
        MouseEvent: "readonly", PointerEvent: "readonly",
        Notification: "readonly", crypto: "readonly", caches: "readonly",
        // Node (server)
        process: "readonly", Buffer: "readonly", __dirname: "readonly",
        __filename: "readonly", global: "readonly", require: "readonly",
        module: "readonly", exports: "readonly",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // ── HOOKS — apenas as regras críticas como ERROR (anti-bug) ──────────
      "react-hooks/exhaustive-deps": "warn",   // alertar mas não quebrar (muito código atual)
      "react-hooks/rules-of-hooks": "error",   // este é sagrado

      // ── Regras experimentais do react-hooks v7 — desligadas por agora ───
      // (set-state-in-effect, purity, refs, static-components, immutability)
      // Têm muitos falso-positivos em código pré-existente. Manter desligadas
      // até refatoração dedicada.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/static-components": "off",
      "react-hooks/immutability": "off",
      "react-hooks/use-memo": "off",

      // ── Limpeza ──────────────────────────────────────────────────────────
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "no-unused-vars": "off",
      // TypeScript já valida nomes não definidos — no-undef gera falso-positivos
      "no-undef": "off",

      // ── Segurança / qualidade ────────────────────────────────────────────
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",  // alguns imports dinâmicos legítimos
      "@typescript-eslint/no-unused-expressions": ["warn", { allowShortCircuit: true, allowTernary: true }],
      "no-console": "off",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-constant-condition": ["warn", { checkLoops: false }],
      "no-useless-assignment": "warn",
      "no-useless-escape": "warn",
      "no-case-declarations": "warn",
      "prefer-const": "warn",

      // ── React refresh (Vite HMR) ─────────────────────────────────────────
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  // Override final — desliga regras com falso-positivos no código atual
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    rules: {
      "no-undef": "off",                                            // TS já valida
      "preserve-caught-error": "off",                               // legado
      "@typescript-eslint/no-non-null-asserted-optional-chain": "warn",
      "no-empty": "off",
    },
  },
);
