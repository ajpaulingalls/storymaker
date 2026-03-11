import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  // Global ignores
  {
    ignores: ["node_modules/", "dist/", "videos/", "templates/**/*.html"],
  },

  // TypeScript files
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.ts"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.node,
        Bun: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Browser JS files (script-loaded, not ES modules)
  {
    files: ["templates/shared/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
