import { afterEach, describe, expect, test, vi } from "vitest";
import RootLayout from "./layout";

vi.mock("@/styles/globals.scss", () => ({}));

vi.mock("next/font/google", () => ({
  Lato: () => ({ className: "lato" }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock("@/lib/service-url", () => ({
  getServiceConfig: vi.fn(() => ({ serviceConfig: { baseUrl: "https://zitadel.test" } })),
}));

vi.mock("@/lib/zitadel", () => ({
  getAllowedLanguages: vi.fn(async () => ({ allowedLanguages: [] })),
}));

describe("root layout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("leaves the look to upstream while LOGIN_THEME is unset", async () => {
    vi.stubEnv("LOGIN_THEME", undefined);

    const html = await RootLayout({ children: <div /> });

    expect(html.type).toBe("html");
    expect(html.props["data-login-theme"]).toBeUndefined();
    expect(html.props.className).toContain("lato");
  });

  test("names the Walther look on <html> for the stylesheet", async () => {
    vi.stubEnv("LOGIN_THEME", "walther");

    const html = await RootLayout({ children: <div /> });

    expect(html.props["data-login-theme"]).toBe("walther");
  });
});
