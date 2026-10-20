import {
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

vi.mock("@/lib/service-url", () => ({
  getServiceConfig: vi.fn(() => ({ serviceConfig: { baseUrl: "https://zitadel.test" } })),
}));

vi.mock("@/lib/zitadel", () => ({
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

vi.mock("@/components/set-register-password-form", () => ({
  SetRegisterPasswordForm: () => <form data-testid="set-register-password-form" />,
}));

async function renderPage() {
  const element = await Page({
    searchParams: Promise.resolve({
      firstname: "Erika",
      lastname: "Mustermann",
      email: "person@example.com",
      organization: "org-walther",
      requestId: "oidc_request",
    }),
  });
  return render(element);
}

describe("register password page", () => {
  beforeEach(() => {
    vi.stubEnv("PASSKEY_REGISTRATION", "true");
    vi.stubEnv("EMAIL_VERIFICATION", "true");
    vi.mocked(getDefaultOrg).mockResolvedValue({ id: "org-walther" } as any);
    vi.mocked(getBrandingSettings).mockResolvedValue(undefined as any);
    vi.mocked(getLegalAndSupportSettings).mockResolvedValue({} as any);
    vi.mocked(getPasswordComplexitySettings).mockResolvedValue({} as any);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  test("stays closed while self-registration is closed, even with the registration with a passkey on (P5)", async () => {
    vi.mocked(getLoginSettings).mockResolvedValue({
      allowRegister: false,
      allowLocalAuthentication: true,
      passkeysType: PasskeysType.ALLOWED,
    } as any);

    const { getByText, queryByTestId } = await renderPage();

    expect(getByText("register.disabled.title")).toBeInTheDocument();
    expect(queryByTestId("set-register-password-form")).toBeNull();
  });

  test("keeps upstream's password form while self-registration is open", async () => {
    vi.mocked(getLoginSettings).mockResolvedValue({
      allowRegister: true,
      allowLocalAuthentication: true,
      passkeysType: PasskeysType.ALLOWED,
    } as any);

    const { getByTestId } = await renderPage();

    expect(getByTestId("set-register-password-form")).toBeInTheDocument();
  });
});
