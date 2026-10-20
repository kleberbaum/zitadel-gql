import { SignInWithIdp } from "@/components/sign-in-with-idp";
import {
  getActiveIdentityProviders,
  getBrandingSettings,
  getDefaultOrg,
  getLegalAndSupportSettings,
  getLoginSettings,
  getPasswordComplexitySettings,
} from "@/lib/zitadel";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import Page from "./page";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => (key: string) => key),
}));

vi.mock("@/lib/service-url", () => ({
  getServiceConfig: vi.fn(() => ({ serviceConfig: { baseUrl: "https://zitadel.test" } })),
}));

vi.mock("@/lib/zitadel", () => ({
  getActiveIdentityProviders: vi.fn(),
  getBrandingSettings: vi.fn(),
  getDefaultOrg: vi.fn(),
  getLegalAndSupportSettings: vi.fn(),
  getLoginSettings: vi.fn(),
  getPasswordComplexitySettings: vi.fn(),
}));

vi.mock("@/components/dynamic-theme", () => ({
  DynamicTheme: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/translated", () => ({
  Translated: ({ i18nKey, namespace }: { i18nKey: string; namespace?: string }) => <span>{`${namespace}.${i18nKey}`}</span>,
}));

vi.mock("@/components/alert", () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>,
}));

vi.mock("@/components/register-form", () => ({
  RegisterForm: () => <form data-testid="register-form" />,
}));

vi.mock("@/components/sign-in-with-idp", () => ({
  SignInWithIdp: vi.fn(() => <div data-testid="sign-in-with-idp" />),
}));

const creationIDP = { id: "idp-id-austria", name: "ID Austria", options: { isCreationAllowed: true } };
const linkingOnlyIDP = { id: "idp-linking", name: "Linking only", options: { isLinkingAllowed: true } };

async function renderPage() {
  const element = await Page({ searchParams: Promise.resolve({ requestId: "oidc_request" }) });
  return render(element);
}

describe("register page", () => {
  beforeEach(() => {
    vi.mocked(getDefaultOrg).mockResolvedValue({ id: "org-walther" } as any);
    vi.mocked(getBrandingSettings).mockResolvedValue(undefined as any);
    vi.mocked(getLegalAndSupportSettings).mockResolvedValue({} as any);
    vi.mocked(getPasswordComplexitySettings).mockResolvedValue({} as any);
    vi.mocked(getActiveIdentityProviders).mockResolvedValue({
      identityProviders: [creationIDP, linkingOnlyIDP],
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("shows only the identity provider buttons when self-registration is closed (P4)", async () => {
    vi.mocked(getLoginSettings).mockResolvedValue({
      allowRegister: false,
      allowExternalIdp: true,
      allowLocalAuthentication: true,
    } as any);

    const { queryByTestId, getByTestId } = await renderPage();

    expect(queryByTestId("register-form")).toBeNull();
    expect(getByTestId("sign-in-with-idp")).toBeInTheDocument();
    expect(vi.mocked(SignInWithIdp).mock.calls[0][0].identityProviders).toEqual([creationIDP]);
  });

  test("shows the registration form together with the buttons when self-registration is open", async () => {
    vi.mocked(getLoginSettings).mockResolvedValue({
      allowRegister: true,
      allowExternalIdp: true,
      allowLocalAuthentication: true,
    } as any);

    const { getByTestId } = await renderPage();

    expect(getByTestId("register-form")).toBeInTheDocument();
    expect(getByTestId("sign-in-with-idp")).toBeInTheDocument();
  });

  test("says registration is disabled when it is closed and no provider allows creation", async () => {
    vi.mocked(getLoginSettings).mockResolvedValue({
      allowRegister: false,
      allowExternalIdp: true,
      allowLocalAuthentication: true,
    } as any);
    vi.mocked(getActiveIdentityProviders).mockResolvedValue({ identityProviders: [linkingOnlyIDP] } as any);

    const { getByText, queryByTestId } = await renderPage();

    expect(getByText("register.disabled.title")).toBeInTheDocument();
    expect(queryByTestId("register-form")).toBeNull();
    expect(queryByTestId("sign-in-with-idp")).toBeNull();
  });
});
