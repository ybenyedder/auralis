import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react/no-unescaped-entities": "warn",
      "@next/next/no-img-element": "warn",
      "no-console": ["warn", { "allow": ["warn", "error"] }],
      "no-debugger": "error",
      "no-unreachable": "error",
      "no-fallthrough": "error",
      "prefer-const": "warn"
    },
  },
  {
    // Node tooling (Electron main/preload, build scripts) — CommonJS + CLI logging.
    files: ["desktop/**/*.js", "desktop/**/*.cjs", "scripts/**/*.mjs", "scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "no-console": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "dist-desktop/**",
      "android/**",
      "mobile/**",
      "coverage/**",
      "*.log",
      "next-env.d.ts",
      // Local Claude Code session state (git-ignored, see .gitignore) — a linked
      // worktree spawned under here during a multi-agent session has its own full
      // copy of the tree, which `eslint .`'s filesystem walk would otherwise pick
      // up as if it were part of THIS checkout, making lint results depend on
      // unrelated concurrent local tooling state instead of just the repo's code.
      ".claude/**"
    ],
  },
];

export default eslintConfig;
