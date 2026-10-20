import { ChooseAuthenticatorToSetup } from "@/components/choose-authenticator-to-setup";
import { LinkIdentityProviders } from "@/components/link-identity-providers";
import { SignInWithIdp } from "@/components/sign-in-with-idp";
import { isSessionValid, loadMostRecentSession } from "@/lib/session";
import { checkUserVerification } from "@/lib/verify-helper";
import {
  getActiveIdentityProviders,
  getBrandingSettings,
  getLoginSettings,
  getUserByID,
  listAuthenticationMethodTypes,
  listIDPLinks,
} from "@/lib/zitadel";
import { cleanup, render } from "@testing-library/react";
import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import Page, { generateMetadata } from "./page";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => (key: string) => key),
}));

vi.mock("@/lib/service-url", () => ({
  getServiceConfig: vi.fn(() => ({ serviceConfig: { baseUrl: "https://zitadel.test" } })),
}));

vi.mock("@/lib/session", () => ({
  isSessionValid: vi.fn(),
  loadMostRecentSession: vi.fn(),
}));

vi.mock("@/lib/verify-helper", () => ({
  checkUserVerification: vi.fn(),
}));

vi.mock("@/lib/cookies", () => ({
  getSessionCookieById: vi.fn(),
}));

vi.mock("@/lib/zitadel", () => ({
  getActiveIdentityProviders: vi.fn(),
  getBrandingSettings: vi.fn(),
  getLoginSettings: vi.fn(),
  getSession: vi.fn(),
  getUserByID: vi.fn(),
  listAuthenticationMethodTypes: vi.fn(),
  listIDPLinks: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/components/dynamic-theme", () => ({
  DynamicTheme: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/translated", () => ({
  Translated: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

vi.mock("@/components/alert", () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>,
}));

vi.mock("@/components/back-button", () => ({
  BackButton: () => <button type="button">back</button>,
}));

vi.mock("@/components/user-avatar", () => ({
  UserAvatar: () => <div data-testid="user-avatar" />,
}));

vi.mock("@/components/choose-authenticator-to-setup", () => ({
  ChooseAuthenticatorToSetup: vi.fn(() => <div data-testid="choose-authenticator" />),
}));

vi.mock("@/components/sign-in-with-idp", () => ({
  SignInWithIdp: vi.fn(() => <div data-testid="sign-in-with-idp" />),
}));

vi.mock("@/components/link-identity-providers", () => ({
  LinkIdentityProviders: vi.fn(() => <div data-testid="link-identity-providers" />),
}));

const session = {
  id: "session-1",
  factors: {
    user: { id: "user-1", loginName: "erika@example.com", organizationId: "org-walther" },
    password: { verifiedAt: { seconds: BigInt(1), nanos: 0 } },
  },
};

async function renderPage() {
  const element = await Page({ searchParams: Promise.resolve({}) });
  return render(element);
}

async function tabTitle() {
  return (await generateMetadata({ searchParams: Promise.resolve({}) })).title;
}

describe("authenticator set page", () => {
  beforeEach(() => {
    vi.mocked(loadMostRecentSession).mockResolvedValue(session as any);
    vi.mocked(listAuthenticationMethodTypes).mockResolvedValue({ authMethodTypes: [] } as any);
    vi.mocked(getUserByID).mockResolvedValue({ user: { type: { case: "human", value: {} } } } as any);
    vi.mocked(getBrandingSettings).mockResolvedValue(undefined as any);
    vi.mocked(getLoginSettings).mockResolvedValue({ allowExternalIdp: true } as any);
    vi.mocked(getActiveIdentityProviders).mockResolvedValue({
      identityProviders: [{ id: "idp-id-austria", name: "ID Austria" }],
    } as any);
    vi.mocked(checkUserVerification).mockResolvedValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("lets a user with a valid session link an identity provider without a recent verification", async () => {
    vi.mocked(isSessionValid).mockResolvedValue(true);

    const { getByTestId } = await renderPage();

    expect(isSessionValid).toHaveBeenCalledWith({ serviceConfig: expect.anything(), session });
    expect(redirect).not.toHaveBeenCalled();
    expect(getByTestId("sign-in-with-idp")).toBeInTheDocument();
    expect(vi.mocked(SignInWithIdp).mock.calls[0][0]).toMatchObject({
      sessionId: "session-1",
      identityProviders: [{ id: "idp-id-austria", name: "ID Austria" }],
    });
    expect(getActiveIdentityProviders).toHaveBeenCalledWith({
      serviceConfig: expect.anything(),
      orgId: "org-walther",
      linking_allowed: true,
    });
  });

  test("keeps accepting a recent verification without asking for the session", async () => {
    vi.mocked(checkUserVerification).mockResolvedValue(true);

    const { getByTestId } = await renderPage();

    expect(getByTestId("sign-in-with-idp")).toBeInTheDocument();
    expect(isSessionValid).not.toHaveBeenCalled();
  });

  test("still sends a user without a valid session or a recent verification to /verify", async () => {
    vi.mocked(isSessionValid).mockResolvedValue(false);

    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT");

    const target = new URL(vi.mocked(redirect).mock.calls[0][0] as string, "https://login.example.com");
    expect(target.pathname).toBe("/verify");
    expect(target.searchParams.get("loginName")).toBe("erika@example.com");
    expect(SignInWithIdp).not.toHaveBeenCalled();
  });
});

describe("authenticator set page for an account that has an authenticator", () => {
  beforeEach(() => {
    vi.mocked(loadMostRecentSession).mockResolvedValue(session as any);
    vi.mocked(listAuthenticationMethodTypes).mockResolvedValue({
      authMethodTypes: [AuthenticationMethodType.PASSWORD],
    } as any);
    vi.mocked(getUserByID).mockResolvedValue({ user: { type: { case: "human", value: {} } } } as any);
    vi.mocked(getBrandingSettings).mockResolvedValue(undefined as any);
    vi.mocked(getLoginSettings).mockResolvedValue({ allowExternalIdp: true } as any);
    vi.mocked(getActiveIdentityProviders).mockResolvedValue({
      identityProviders: [{ id: "idp-id-austria", name: "ID Austria" }],
    } as any);
    vi.mocked(listIDPLinks).mockResolvedValue({ result: [] } as any);
    vi.mocked(checkUserVerification).mockResolvedValue(false);
    vi.mocked(isSessionValid).mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("offers to link a provider instead of warning that an authenticator exists", async () => {
    const { getByTestId, queryByTestId, queryByRole } = await renderPage();

    expect(getByTestId("link-identity-providers")).toBeInTheDocument();
    expect(queryByTestId("choose-authenticator")).not.toBeInTheDocument();
    expect(queryByRole("alert")).not.toBeInTheDocument();
    expect(SignInWithIdp).not.toHaveBeenCalled();
    expect(vi.mocked(LinkIdentityProviders).mock.calls[0][0]).toMatchObject({
      identityProviders: [{ id: "idp-id-austria", name: "ID Austria" }],
      linkedIdpIds: [],
      organization: "org-walther",
      sessionId: "session-1",
    });
    expect(listIDPLinks).toHaveBeenCalledWith({ serviceConfig: expect.anything(), userId: "user-1" });
  });

  test("heads the page with its sign-in methods instead of asking to choose one", async () => {
    const { getByRole, getByText, queryByText } = await renderPage();

    expect(getByRole("heading", { level: 1 })).toHaveTextContent(/^linkTitle$/);
    expect(getByText("accountReady")).toBeInTheDocument();
    expect(queryByText("description")).not.toBeInTheDocument();
    expect(await tabTitle()).toBe("linkTitle");
  });

  test("passes on the providers the account is linked with already", async () => {
    vi.mocked(listIDPLinks).mockResolvedValue({
      result: [{ idpId: "idp-id-austria", userId: "qes-subject", userName: "erika" }],
    } as any);

    await renderPage();

    expect(vi.mocked(LinkIdentityProviders).mock.calls[0][0]).toMatchObject({
      linkedIdpIds: ["idp-id-austria"],
    });
  });

  test("keeps every provider on offer when the links cannot be listed", async () => {
    vi.mocked(listIDPLinks).mockRejectedValue(new Error("permission denied"));

    const { getByTestId } = await renderPage();

    expect(getByTestId("link-identity-providers")).toBeInTheDocument();
    expect(vi.mocked(LinkIdentityProviders).mock.calls[0][0]).toMatchObject({
      identityProviders: [{ id: "idp-id-austria", name: "ID Austria" }],
      linkedIdpIds: [],
    });
  });

  test("offers no provider and asks for no links while external providers are off", async () => {
    vi.mocked(getLoginSettings).mockResolvedValue({ allowExternalIdp: false } as any);

    const { getByTestId } = await renderPage();

    expect(getByTestId("link-identity-providers")).toBeInTheDocument();
    expect(vi.mocked(LinkIdentityProviders).mock.calls[0][0]).toMatchObject({
      identityProviders: [],
      linkedIdpIds: [],
    });
    expect(listIDPLinks).not.toHaveBeenCalled();
  });

  test("keeps upstream's choice of authenticators for an account without one", async () => {
    vi.mocked(listAuthenticationMethodTypes).mockResolvedValue({ authMethodTypes: [] } as any);

    const { getByRole, getByTestId, queryByTestId, queryByText } = await renderPage();

    expect(getByRole("heading", { level: 1 })).toHaveTextContent(/^title$/);
    expect(queryByText("accountReady")).not.toBeInTheDocument();
    expect(await tabTitle()).toBe("title");
    expect(getByTestId("choose-authenticator")).toBeInTheDocument();
    expect(getByTestId("sign-in-with-idp")).toBeInTheDocument();
    expect(queryByTestId("link-identity-providers")).not.toBeInTheDocument();
    expect(listIDPLinks).not.toHaveBeenCalled();
  });

  test("lets an account with a second factor alone choose a password or a passkey", async () => {
    vi.mocked(listAuthenticationMethodTypes).mockResolvedValue({
      authMethodTypes: [AuthenticationMethodType.TOTP],
    } as any);

    const { getByRole, getByTestId, queryByTestId, queryByText } = await renderPage();

    expect(getByTestId("choose-authenticator")).toBeInTheDocument();
    expect(vi.mocked(ChooseAuthenticatorToSetup).mock.calls[0][0]).toMatchObject({ authMethods: [] });
    expect(queryByTestId("link-identity-providers")).not.toBeInTheDocument();
    expect(getByRole("heading", { level: 1 })).toHaveTextContent(/^title$/);
    expect(queryByText("accountReady")).not.toBeInTheDocument();
    expect(await tabTitle()).toBe("title");
  });

  test("counts a linked identity provider as a way to sign in", async () => {
    vi.mocked(listAuthenticationMethodTypes).mockResolvedValue({
      authMethodTypes: [AuthenticationMethodType.IDP, AuthenticationMethodType.TOTP],
    } as any);

    const { getByTestId, queryByTestId } = await renderPage();

    expect(getByTestId("link-identity-providers")).toBeInTheDocument();
    expect(queryByTestId("choose-authenticator")).not.toBeInTheDocument();
    expect(await tabTitle()).toBe("linkTitle");
  });

  test("keeps upstream's tab title when the session cannot be loaded", async () => {
    vi.mocked(loadMostRecentSession).mockResolvedValue(undefined as any);

    expect(await tabTitle()).toBe("title");
  });
});
