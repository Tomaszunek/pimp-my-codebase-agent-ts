import js from "@eslint/js";
import json from "@eslint/json";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { flatConfigs as importXFlatConfigs } from "eslint-plugin-import-x";
import nodePlugin from "eslint-plugin-n";
import { configs as packageJsonConfigs } from "eslint-plugin-package-json";
import perfectionist from "eslint-plugin-perfectionist";
import promise from "eslint-plugin-promise";
import { configs as regexpConfigs } from "eslint-plugin-regexp";
import security from "eslint-plugin-security";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

const tsFiles = ["src/**/*.ts", "tests/**/*.ts"];
const jsFiles = ["*.js", "*.mjs", "*.cjs", "src/**/*.js"];
const codeFiles = [...jsFiles, ...tsFiles];
const jsonFiles = ["**/*.json"];
const configDirectory = path.dirname(fileURLToPath(import.meta.url));

const typedTypeScriptAll = tseslint.configs.all.map((config) => ({
  ...config,
  files: tsFiles
}));

export default tseslint.config(
  {
    name: "pimp-my-codebase/ignores",
    ignores: ["dist/**", ".test-dist/**", ".test-tmp/**", "node_modules/**", ".pimp-my-codebase/runs/**", "package-lock.json"]
  },
  packageJsonConfigs.recommended,
  {
    name: "pimp-my-codebase/json",
    files: jsonFiles,
    ignores: ["package.json"],
    plugins: { json },
    language: "json/json",
    rules: json.configs.recommended.rules
  },
  {
    ...js.configs.recommended,
    files: jsFiles
  },
  {
    ...unicorn.configs["flat/recommended"],
    files: codeFiles
  },
  {
    ...nodePlugin.configs["flat/recommended"],
    files: codeFiles
  },
  {
    ...security.configs.recommended,
    files: codeFiles
  },
  {
    ...promise.configs["flat/recommended"],
    files: codeFiles
  },
  {
    ...regexpConfigs["flat/recommended"],
    files: codeFiles
  },
  {
    ...importXFlatConfigs.recommended,
    files: codeFiles
  },
  {
    ...importXFlatConfigs.typescript,
    files: tsFiles,
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: "tsconfig.json"
        })
      ]
    }
  },
  {
    name: "pimp-my-codebase/perfectionist",
    files: codeFiles,
    plugins: { perfectionist },
    rules: {
      "perfectionist/sort-exports": ["error", { order: "asc", type: "natural" }],
      "perfectionist/sort-imports": ["error", { order: "asc", type: "natural" }],
      "perfectionist/sort-named-exports": ["error", { order: "asc", type: "natural" }],
      "perfectionist/sort-named-imports": ["error", { order: "asc", type: "natural" }]
    }
  },
  ...typedTypeScriptAll,
  {
    name: "pimp-my-codebase/node-runtime",
    files: ["*.js", "*.mjs", "*.cjs", ...tsFiles],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    name: "pimp-my-codebase/typescript-project",
    files: tsFiles,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: configDirectory
      }
    }
  },
  {
    name: "pimp-my-codebase/rule-tuning",
    files: tsFiles,
    rules: {
      "no-console": "off",
      "n/hashbang": "off",
      "@typescript-eslint/no-magic-numbers": [
        "error",
        {
          ignore: [-1, 0, 1, 2],
          ignoreDefaultValues: true
        }
      ],
      "@typescript-eslint/prefer-readonly-parameter-types": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowBoolean: true,
          allowNumber: true
        }
      ]
    }
  }
);
