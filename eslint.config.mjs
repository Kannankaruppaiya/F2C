import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "storage/**"] },
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // New in eslint-config-next 16 (React Compiler guidance). The flagged pattern — closing a dialog
      // or resetting local UI state in an effect after a server action result — is intentional here;
      // adopting the rule is a separate refactor, not part of the framework upgrade.
      "react-hooks/set-state-in-effect": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
    },
  },
];

export default config;
