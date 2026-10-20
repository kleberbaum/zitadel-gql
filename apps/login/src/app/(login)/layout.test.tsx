import { BackgroundWrapper } from "@/components/background-wrapper";
import { WaltherFrame, WaltherFrameFallback } from "@/components/walther-frame";
import { isValidElement, ReactElement, ReactNode, Suspense } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import RootLayout from "./layout";

vi.mock("@/styles/globals.scss", () => ({}));
vi.mock("@/styles/walther.scss", () => ({}));

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

/** Whether the element tree holds an element of the given component, the Suspense fallback aside. */
function contains(node: ReactNode, type: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some((child) => contains(child, type));
  }
  if (!isValidElement(node)) {
    return false;
  }
  const element = node as ReactElement<{ children?: ReactNode }>;
  return element.type === type || contains(element.props.children, type);
}

/** The first element of the given component in the element tree, the Suspense fallback aside. */
function find(node: ReactNode, type: unknown): ReactElement<any> | undefined {
  if (Array.isArray(node)) {
    return node.map((child) => find(child, type)).find(Boolean);
  }
  if (!isValidElement(node)) {
    return undefined;
  }
  const element = node as ReactElement<{ children?: ReactNode }>;
  return element.type === type ? element : find(element.props.children, type);
}

/** What the layout shows while a page loads. */
function fallback(html: ReactNode): ReactNode {
  return find(html, Suspense)?.props.fallback;
}

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
    expect(contains(html, BackgroundWrapper)).toBe(true);
    expect(contains(html, WaltherFrame)).toBe(false);
  });

  test("names the Walther look on <html> for the stylesheet", async () => {
    vi.stubEnv("LOGIN_THEME", "walther");

    const html = await RootLayout({ children: <div /> });

    expect(html.props["data-login-theme"]).toBe("walther");
  });

  test("frames the pages with the wiki's header and footer in the Walther look", async () => {
    vi.stubEnv("LOGIN_THEME", "walther");

    const html = await RootLayout({ children: <div /> });

    expect(contains(html, WaltherFrame)).toBe(true);
    expect(contains(html, BackgroundWrapper)).toBe(false);
  });

  test("draws the wiki's frame while a page loads in the Walther look", async () => {
    vi.stubEnv("LOGIN_THEME", "walther");

    const html = await RootLayout({ children: <div /> });

    expect(contains(fallback(html), WaltherFrameFallback)).toBe(true);
    expect(contains(fallback(html), BackgroundWrapper)).toBe(false);
  });

  test("keeps upstream's loading state while LOGIN_THEME is unset", async () => {
    vi.stubEnv("LOGIN_THEME", undefined);

    const html = await RootLayout({ children: <div /> });

    expect(contains(fallback(html), BackgroundWrapper)).toBe(true);
    expect(contains(fallback(html), WaltherFrameFallback)).toBe(false);
  });
});
