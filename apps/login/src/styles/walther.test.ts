// @vitest-environment node
import { fileURLToPath } from "node:url";
import * as sass from "sass";
import { describe, expect, test } from "vitest";

const css = sass.compile(fileURLToPath(new URL("./walther.scss", import.meta.url))).css;

const MODES = ["light", "dark"];
const TYPES = ["background", "primary", "warn", "text", "link"];
const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];

/** The selectors of a flat stylesheet, a list split at its top-level commas only. */
function selectors(stylesheet: string): string[] {
  return stylesheet
    .split("}")
    .map((block) => block.split("{")[0].trim())
    .filter(Boolean)
    .flatMap((list) => {
      const parts: string[] = [];
      let depth = 0;
      let start = 0;
      for (let i = 0; i < list.length; i++) {
        if (list[i] === "(") depth++;
        if (list[i] === ")") depth--;
        if (list[i] === "," && depth === 0) {
          parts.push(list.slice(start, i));
          start = i + 1;
        }
      }
      parts.push(list.slice(start));
      return parts.map((selector) => selector.trim());
    });
}

describe("the Walther look", () => {
  test("applies only below html[data-login-theme=walther], so upstream's look stays as it is", () => {
    const all = selectors(css);

    expect(all.length).toBeGreaterThan(10);
    for (const selector of all) {
      expect(selector).toMatch(/^html\[data-login-theme=walther\]/);
    }
  });

  test("sets every colour variable upstream's components read, over the inline branding", () => {
    for (const mode of MODES) {
      for (const type of TYPES) {
        for (const shade of SHADES) {
          expect(css).toMatch(new RegExp(`--theme-${mode}-${type}-${shade}: [^;]+ !important;`));
          expect(css).toMatch(new RegExp(`--theme-${mode}-${type}-contrast-${shade}: [^;]+ !important;`));
        }
      }
      for (const type of ["text", "link"]) {
        for (const shade of SHADES) {
          expect(css).toMatch(new RegExp(`--theme-${mode}-${type}-secondary-${shade}: [^;]+ !important;`));
        }
      }
    }
  });

  test("uses the wiki's colours, font and corners", () => {
    expect(css).toContain("--theme-light-primary-500: #0063a6 !important;");
    expect(css).toContain("--theme-dark-background-600: #1a202c !important;");
    expect(css).toContain(
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol" !important;',
    );
    expect(css).toContain("--radius-md: 0.75rem;");
  });

  test("loads no webfont, as the wiki loads none", () => {
    expect(css).not.toContain("@font-face");
    expect(css).not.toMatch(/url\(/);
  });
});
