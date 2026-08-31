import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["dist", "node_modules", "src-tauri/target", "*.tsbuildinfo"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Existing hydration effects intentionally bridge persisted/external state.
      // Keep exhaustive-deps strict while avoiding noisy false-positive warnings.
      "react-hooks/set-state-in-effect": "off",
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["*.config.{js,ts}", "vite.config.ts", "vitest.config.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
  },
  {
    files: ["src/**/*.test.{ts,tsx}", "src/test/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
        ...globals.vitest,
      },
    },
  },
];
