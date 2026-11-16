import pluginJs from "@eslint/js";
import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    // Build outputs, logi i pliki generowane — nigdy nie lintowane.
    ignores: [
      "node_modules/**",
      "dist/**",
      ".output/**",
      "backend/.output/**",
      "backend/node_modules/**",
      "backend/logs/**",
      "logs/**",
      "coverage/**",
      ".tanstack/**",
      "src/routeTree.gen.*",
      "src/components/ui/**",
    ],
  },
  pluginJs.configs.recommended,
  {
    // JS + JSX (aplikacja, konfiguracje .js)
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": pluginReactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: { ...globals.node }, parserOptions: { ecmaVersion: "latest", sourceType: "module" } },
    rules: { "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }] },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { globals: { ...globals.node }, parserOptions: { ecmaVersion: "latest", sourceType: "commonjs" } },
    rules: { "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }] },
  },
];
