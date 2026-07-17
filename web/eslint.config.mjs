import nextConfig from "eslint-config-next";
import i18nPlugin from "./eslint/i18n-plugin.mjs";

const config = [
  ...nextConfig,
  {
    rules: {
      // React 19/compiler rules expose useful migration work across legacy
      // surfaces, but they are too broad to block every unrelated PR yet.
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/set-state-in-render": "warn",
    },
  },
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    plugins: {
      i18n: i18nPlugin,
    },
    rules: {
      // During migration keep as warning; change to "error" once phase2/3 complete.
      "i18n/no-literal-ui-text": "warn",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      // Vendored libraries — built artifacts and build configs reference
      // eslint rules our config doesn't load (gotcha #41 pruned the toolchain).
      "packages/*/dist/**",
      "packages/*/rollup.config.*",
    ],
  },
];

export default config;
