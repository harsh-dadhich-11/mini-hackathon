import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Brand guard: the BOT Consulting look comes from the tokens in src/app/globals.css, so the defaults that
 * would drift away from it fail lint. Matched against string literals and template chunks alike, so it catches
 * classes in `const styles = "..."` as well as inline className props.
 */
const banned = [
  {
    pattern: "\\b(bg|text|border|ring|outline|fill|stroke|from|to|via|divide|accent|caret|decoration|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d",
    message: "Default Tailwind palette. Use the brand tokens (teal-* / cyan-* / orange-* / cream / ink / muted / success / warning / danger).",
  },
  {
    pattern: "\\b(bg|text|border|ring|outline|fill|stroke|from|to|via|shadow)-\\[(#|rgb)",
    message: "Hard-coded colour. Add a token to src/app/globals.css instead.",
  },
  {
    pattern: "\\bbg-(linear|gradient)-to-",
    message: "Gradient utility. The brand is flat colour.",
  },
  {
    pattern: "\\bfont-(extrabold|black)\\b",
    message: "Headlines get their weight from size and the display face. Use font-semibold or font-bold.",
  },
];

const brandGuard = banned.flatMap(({ pattern, message }) => [
  { selector: `Literal[value=/${pattern}/]`, message },
  { selector: `TemplateElement[value.raw=/${pattern}/]`, message },
]);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "dist/**", "next-env.d.ts"]),
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...brandGuard] },
  },
]);

export default eslintConfig;
