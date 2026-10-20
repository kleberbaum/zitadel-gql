import { RegisterWithPasskey } from "@/components/register-with-passkey";
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
import { PasskeysType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
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

vi.mock("@/components/register-with-passkey", () => ({
  RegisterWithPasskey: vi.fn(() => <section data-testid="register-passkey" />),
}));

const creationIDP = { id: "idp-id-austria", name: "ID Austria", options: { isCreationAllowed: true } };
const linkingOnlyIDP = { id: "idp-linking", name: "Linking only", options: { isLinkingAllowed: true } };

async function renderPage(searchParams: Record<string, string> = {}) {
  const element = await Page({ searchParams: Promise.resolve({ requestId: "oidc_request", ...searchParams }) });
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

  test("puts no 'or sign in with' above the buttons while self-registration is closed", async () => {
    vi.mocked(getLoginSettings).mockResolvedValue({
      allowRegister: false,
      allowExternalIdp: true,
      allowLocalAuthentication: true,
    } as any);

    await renderPage();

    expect(vi.mocked(SignInWithIdp).mock.calls[0][0].showLabel).toBe(false);
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
    expect(vi.mocked(SignInWithIdp).mock.calls[0][0].showLabel).toBe(true);
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

describe("register page with the registration with a passkey (P5)", () => {
  const legal = { tosLink: "https://walther.exp.univie.ac.at/terms-of-service/" };

  function closedWithPasskeys(overrides: Record<string, unknown> = {}) {
    vi.mocked(getLoginSettings).mockResolvedValue({
      allowRegister: false,
      allowExternalIdp: true,
      allowLocalAuthentication: true,
      passkeysType: PasskeysType.ALLOWED,
      ...overrides,
    } as any);
  }

  beforeEach(() => {
    vi.stubEnv("PASSKEY_REGISTRATION", "true");
    vi.stubEnv("EMAIL_VERIFICATION", "true");
    vi.mocked(getDefaultOrg).mockResolvedValue({ id: "org-walther" } as any);
    vi.mocked(getBrandingSettings).mockResolvedValue(undefined as any);
    vi.mocked(getLegalAndSupportSettings).mockResolvedValue(legal as any);
    vi.mocked(getPasswordComplexitySettings).mockResolvedValue({} as any);
    vi.mocked(getActiveIdentityProviders).mockResolvedValue({
      identityProviders: [creationIDP, linkingOnlyIDP],
    } as any);
    closedWithPasskeys();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  test("offers it below the identity provider buttons, so ID Austria stays first", async () => {
    const { getByTestId, queryByTestId } = await renderPage();

    const providers = getByTestId("sign-in-with-idp");
    const passkey = getByTestId("register-passkey");
    expect(providers.compareDocumentPosition(passkey) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(queryByTestId("register-form")).toBeNull();
    expect(vi.mocked(SignInWithIdp).mock.calls[0][0]).toMatchObject({
      showLabel: false,
      identityProviders: [creationIDP],
    });
  });

  test("hands the form the organization, the request and the legal settings, set off from the buttons", async () => {
    await renderPage({ firstname: "Erika", lastname: "Mustermann", email: "person@example.com" });

    expect(vi.mocked(RegisterWithPasskey).mock.calls[0][0]).toEqual({
      legal,
      organization: "org-walther",
      firstname: "Erika",
      lastname: "Mustermann",
      email: "person@example.com",
      requestId: "oidc_request",
      belowProviders: true,
    });
  });

  test("offers it alone instead of saying registration is disabled when no provider allows creation", async () => {
    vi.mocked(getActiveIdentityProviders).mockResolvedValue({ identityProviders: [linkingOnlyIDP] } as any);

    const { getByTestId, queryByTestId, queryByText } = await renderPage();

    expect(getByTestId("register-passkey")).toBeInTheDocument();
    expect(queryByTestId("sign-in-with-idp")).toBeNull();
    expect(queryByText("register.disabled.title")).toBeNull();
    expect(vi.mocked(RegisterWithPasskey).mock.calls[0][0].belowProviders).toBe(false);
  });

  test("is not offered when the organization does not allow passkeys", async () => {
    closedWithPasskeys({ passkeysType: PasskeysType.NOT_ALLOWED });

    const { getByTestId, queryByTestId } = await renderPage();

    expect(queryByTestId("register-passkey")).toBeNull();
    expect(getByTestId("sign-in-with-idp")).toBeInTheDocument();
  });

  test("is not offered without PASSKEY_REGISTRATION, the page stays as before", async () => {
    vi.stubEnv("PASSKEY_REGISTRATION", "");

    const { getByTestId, queryByTestId } = await renderPage();

    expect(queryByTestId("register-passkey")).toBeNull();
    expect(queryByTestId("register-form")).toBeNull();
    expect(getByTestId("sign-in-with-idp")).toBeInTheDocument();
    expect(vi.mocked(SignInWithIdp).mock.calls[0][0].showLabel).toBe(false);
  });

  test("leaves registration disabled without PASSKEY_REGISTRATION when no provider allows creation", async () => {
    vi.stubEnv("PASSKEY_REGISTRATION", "");
    vi.mocked(getActiveIdentityProviders).mockResolvedValue({ identityProviders: [linkingOnlyIDP] } as any);

    const { getByText, queryByTestId } = await renderPage();

    expect(getByText("register.disabled.title")).toBeInTheDocument();
    expect(queryByTestId("register-passkey")).toBeNull();
  });

  test("keeps upstream's form with its choice of the method while self-registration is open", async () => {
    closedWithPasskeys({ allowRegister: true });

    const { getByTestId, queryByTestId } = await renderPage();

    expect(getByTestId("register-form")).toBeInTheDocument();
    expect(queryByTestId("register-passkey")).toBeNull();
  });
});
