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

/** The declarations of the rule whose selector list is exactly this one. */
function declarations(selector: string): Record<string, string> {
  const rule = css
    .split("}")
    .map((block) => block.split("{"))
    .find(([list]) => list.trim() === selector);
  expect(rule, selector).toBeDefined();
  return Object.fromEntries(
    rule![1]
      .split(";")
      .map((declaration) => declaration.split(":").map((part) => part.trim()))
      .filter(([property]) => property)
      .map(([property, ...value]) => [property, value.join(":")]),
  );
}

/** A colour as #rrggbb, or as rgba(r, g, b, a) laid over an opaque ground, in sRGB channels. */
function channels(colour: string, ground = "#ffffff"): number[] {
  const hex = colour.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
  }
  const rgba = colour.match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);
  expect(rgba, colour).not.toBeNull();
  const alpha = Number(rgba![4]);
  return channels(ground).map((under, i) => Number(rgba![i + 1]) * alpha + under * (1 - alpha));
}

/** The contrast ratio of two colours, as WCAG 2 defines it. */
function contrast(a: number[], b: number[]): number {
  const luminance = (rgb: number[]) => {
    const [r, g, bl] = rgb.map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const ROOT = "html[data-login-theme=walther]";

// The card the fields sit on, background 500: white, and gray.750 in dark mode.
const CARD = { light: "#ffffff", dark: "#212836" };

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

  test("keeps the white label of a hovered primary button readable in both modes", () => {
    const hover = declarations(`${ROOT} .ztdl-button-primary:hover:not(:disabled)`);

    expect(declarations(`${ROOT} .ztdl-button-primary`).color).toBe("#ffffff");
    expect(hover["background-color"]).toBe("#046eb6");
    expect(contrast(channels(hover["background-color"]), channels("#ffffff"))).toBeGreaterThanOrEqual(4.5);
    // No rule for dark mode swaps in a lighter blue.
    expect(selectors(css).filter((selector) => selector.includes(".ztdl-button-primary:hover"))).toEqual([
      `${ROOT} .ztdl-button-primary:hover:not(:disabled)`,
    ]);
  });

  test("sets the border of a field off from the card at 3:1 or more in both modes", () => {
    for (const [mode, selector] of [
      ["light", `${ROOT} .ztdl-input`],
      ["light", `${ROOT} .ztdl-input:hover`],
      ["dark", `${ROOT}.dark .ztdl-input`],
      ["dark", `${ROOT}.dark .ztdl-input:hover`],
    ] as const) {
      const border = declarations(selector)["border-color"];
      expect(contrast(channels(border, CARD[mode]), channels(CARD[mode])), selector).toBeGreaterThanOrEqual(3);
    }
  });

  test("brings no webfont of its own, as the wiki loads none", () => {
    expect(css).not.toContain("@font-face");
    expect(css).not.toMatch(/url\(/);
  });
});
