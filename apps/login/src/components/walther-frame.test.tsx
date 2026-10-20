import { cleanup, render, screen, within } from "@testing-library/react";
import { getLocale } from "next-intl/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import de from "../../locales/de.json";
import en from "../../locales/en.json";
import { WaltherFrame } from "./walther-frame";

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "de"),
  getTranslations: vi.fn(async (namespace: string) => {
    const { getLocale } = await import("next-intl/server");
    const messages = (await getLocale()) === "de" ? de : en;
    return (key: string) => (messages as any)[namespace][key];
  }),
}));

vi.mock("@/components/language-switcher", () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher" />,
}));

vi.mock("@/components/theme-switch", () => ({
  default: () => <div data-testid="theme-switch" />,
}));

async function renderFrame(locale: "de" | "en") {
  vi.mocked(getLocale).mockResolvedValue(locale);
  return render(
    await WaltherFrame({
      languages: [],
      children: <p>Willkommen zurück</p>,
    }),
  );
}

describe("<WaltherFrame />", () => {
  afterEach(cleanup);

  test("puts the page between the wiki's header and footer", async () => {
    await renderFrame("de");

    expect(within(screen.getByRole("main")).getByText("Willkommen zurück")).toBeInTheDocument();
    expect(within(screen.getByRole("banner")).getByTestId("language-switcher")).toBeInTheDocument();
    expect(within(screen.getByRole("banner")).getByTestId("theme-switch")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Universität Wien");
  });

  test("shows the University of Vienna logo for light and dark ground, linked to the wiki", async () => {
    await renderFrame("de");

    const home = screen.getByRole("link", { name: "Zur Startseite des Walther Wikis" });
    expect(home).toHaveAttribute("href", "https://walther.exp.univie.ac.at/");

    const logos = within(home).getAllByRole("img", { name: "Universität Wien" });
    expect(logos.map((logo) => logo.getAttribute("src"))).toEqual([
      expect.stringMatching(/\/walther\/universitaet-wien\.svg$/),
      expect.stringMatching(/\/walther\/universitaet-wien-dark\.svg$/),
    ]);
  });

  test("links the wiki's legal pages in German", async () => {
    await renderFrame("de");

    const legal = screen.getByRole("navigation", { name: "Rechtliches" });
    const links = within(legal)
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href")]);

    expect(links).toEqual([
      ["Impressum", "https://walther.exp.univie.ac.at/imprint/"],
      ["Datenschutz", "https://walther.exp.univie.ac.at/privacy-policy/"],
      ["Nutzungsbedingungen", "https://walther.exp.univie.ac.at/terms-of-service/"],
    ]);
    for (const link of within(legal).getAllByRole("link")) {
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  test("links the English pages of the wiki in English", async () => {
    await renderFrame("en");

    expect(screen.getByRole("link", { name: "To the start page of the Walther Wiki" })).toHaveAttribute(
      "href",
      "https://walther.exp.univie.ac.at/en/",
    );
    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(within(legal).getByRole("link", { name: "Legal notice" })).toHaveAttribute(
      "href",
      "https://walther.exp.univie.ac.at/en/imprint/",
    );
    expect(within(legal).getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "https://walther.exp.univie.ac.at/en/privacy-policy/",
    );
    expect(within(legal).getByRole("link", { name: "Terms of Service" })).toHaveAttribute(
      "href",
      "https://walther.exp.univie.ac.at/en/terms-of-service/",
    );
  });

  test("draws the wiki's arrow backdrop, hidden from assistive technology", async () => {
    const { container } = await renderFrame("de");

    const backdrop = container.querySelector("svg[aria-hidden='true']");
    expect(backdrop?.querySelector("pattern#walther-arrows")).not.toBeNull();
    expect(backdrop?.querySelectorAll(":scope > svg > path")).toHaveLength(6);
  });
});
