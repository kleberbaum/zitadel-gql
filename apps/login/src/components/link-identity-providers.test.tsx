import { cleanup, render, screen, within } from "@testing-library/react";
import { IdentityProviderType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, test, vi } from "vitest";
import de from "../../locales/de.json";
import en from "../../locales/en.json";
import { LinkIdentityProviders } from "./link-identity-providers";

vi.mock("@/lib/server/idp", () => ({
  redirectToIdp: vi.fn(),
}));

const idAustria = { id: "idp-id-austria", name: "ID Austria", type: IdentityProviderType.OIDC } as any;
const github = { id: "idp-github", name: "GitHub", type: IdentityProviderType.OIDC } as any;

function renderLinking(props: { identityProviders: any[]; linkedIdpIds: string[] }, locale: "de" | "en" = "de") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "de" ? de : en}>
      <LinkIdentityProviders {...props} organization="org-walther" sessionId="session-1" />
    </NextIntlClientProvider>,
  );
}

describe("<LinkIdentityProviders />", () => {
  afterEach(cleanup);

  test("neither warns that an authenticator is set up nor repeats the page's sentence", () => {
    renderLinking({ identityProviders: [idAustria], linkedIdpIds: [] });

    expect(screen.queryByText(/bereits einen Authentifikator/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ihr Konto ist eingerichtet/)).not.toBeInTheDocument();
  });

  test("titles the section after the one provider and links it to the signed-in account", () => {
    const { container } = renderLinking({ identityProviders: [idAustria], linkedIdpIds: [] });

    const section = screen.getByRole("region", { name: "Konto mit ID Austria verknüpfen" });
    expect(within(section).getByText("Danach können Sie sich auch mit ID Austria anmelden.")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "ID Austria" })).toBeInTheDocument();

    const form = container.querySelector("form");
    expect(form?.querySelector('input[name="id"]')).toHaveValue("idp-id-austria");
    expect(form?.querySelector('input[name="sessionId"]')).toHaveValue("session-1");
    expect(form?.querySelector('input[name="organization"]')).toHaveValue("org-walther");
  });

  test("says so for a provider the account is linked with instead of offering it again", () => {
    renderLinking({ identityProviders: [idAustria], linkedIdpIds: ["idp-id-austria"] });

    expect(screen.getByTestId("idp-linked-idp-id-austria")).toHaveTextContent(
      "Ihr Konto ist bereits mit ID Austria verknüpft.",
    );
    expect(screen.queryByRole("button", { name: "ID Austria" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  test("offers only the providers that are not linked yet", () => {
    renderLinking({ identityProviders: [idAustria, github], linkedIdpIds: ["idp-github"] });

    const section = screen.getByRole("region", { name: "Konto mit ID Austria verknüpfen" });
    expect(within(section).getByRole("button", { name: "ID Austria" })).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "GitHub" })).not.toBeInTheDocument();
    expect(screen.getByTestId("idp-linked-idp-github")).toHaveTextContent("Ihr Konto ist bereits mit GitHub verknüpft.");
  });

  test("uses a general title for several providers", () => {
    renderLinking({ identityProviders: [idAustria, github], linkedIdpIds: [] });

    const section = screen.getByRole("region", { name: "Konto mit einem Identitätsanbieter verknüpfen" });
    expect(within(section).getByRole("button", { name: "ID Austria" })).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "GitHub" })).toBeInTheDocument();
  });

  test("shows nothing when there is nothing to link", () => {
    const { container } = renderLinking({ identityProviders: [], linkedIdpIds: [] });

    expect(container.textContent).toBe("");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("speaks English", () => {
    renderLinking({ identityProviders: [idAustria], linkedIdpIds: [] }, "en");

    const section = screen.getByRole("region", { name: "Link your account with ID Austria" });
    expect(within(section).getByText("Afterwards you can also sign in with ID Austria.")).toBeInTheDocument();
  });
});
