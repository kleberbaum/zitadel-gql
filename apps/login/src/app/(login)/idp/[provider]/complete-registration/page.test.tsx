import { RegisterFormIDPIncomplete } from "@/components/register-form-idp-incomplete";
import { getBrandingSettings, retrieveIDPIntent } from "@/lib/zitadel";
import { cleanup, render } from "@testing-library/react";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import CompleteRegistrationPage from "./page";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/lib/service-url", () => ({
  getServiceConfig: vi.fn(() => ({ serviceConfig: { baseUrl: "https://zitadel.test" } })),
}));

vi.mock("@/lib/zitadel", () => ({
  getBrandingSettings: vi.fn(),
  retrieveIDPIntent: vi.fn(),
}));

vi.mock("@/components/dynamic-theme", () => ({
  DynamicTheme: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/translated", () => ({
  Translated: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

vi.mock("@/components/register-form-idp-incomplete", () => ({
  RegisterFormIDPIncomplete: vi.fn(() => <form data-testid="complete-registration-form" />),
}));

const searchParams = {
  id: "intent-1",
  token: "intent-token-1",
  requestId: "oidc_request",
  organization: "org-walther",
  idpId: "idp-id-austria",
  idpUserId: "qes-sub-1",
  email: "",
  // a crafted query string must not decide the names
  givenName: "Mallory",
  familyName: "Forged",
};

function renderPage(params: Record<string, string> = searchParams) {
  return CompleteRegistrationPage({
    searchParams: Promise.resolve(params),
    params: Promise.resolve({ provider: "oidc" }),
  }).then((element) => render(element));
}

describe("complete-registration page", () => {
  beforeEach(() => {
    vi.mocked(getBrandingSettings).mockResolvedValue(undefined);
    vi.mocked(retrieveIDPIntent).mockResolvedValue({
      idpInformation: { idpId: "idp-id-austria", userId: "qes-sub-1", userName: "" },
      userAction: {
        case: "createUser",
        value: {
          userType: { case: "human", value: { profile: { givenName: "Erika", familyName: "Mustermann" } } },
        },
      },
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("reads the names from the intent and hands them to the form read only", async () => {
    const { getByTestId } = await renderPage();

    expect(getByTestId("complete-registration-form")).toBeInTheDocument();
    expect(retrieveIDPIntent).toHaveBeenCalledWith({
      serviceConfig: expect.anything(),
      id: "intent-1",
      token: "intent-token-1",
    });

    const props = vi.mocked(RegisterFormIDPIncomplete).mock.calls[0][0];
    expect(props.idpNames).toEqual({ givenName: "Erika", familyName: "Mustermann" });
    expect(props.defaultValues).toEqual({ email: "" });
    expect(props).not.toHaveProperty("idpUserName");
  });

  test("leaves the names to the person when the provider sent none", async () => {
    vi.mocked(retrieveIDPIntent).mockResolvedValue({
      idpInformation: { idpId: "idp-id-austria", userId: "qes-sub-1", userName: "" },
      userAction: { case: "createUser", value: { userType: { case: "human", value: { profile: {} } } } },
    } as any);

    await renderPage();

    const props = vi.mocked(RegisterFormIDPIncomplete).mock.calls[0][0];
    expect(props.idpNames).toEqual({ givenName: undefined, familyName: undefined });
  });

  test("sends the person to registration-failed when the intent cannot be read", async () => {
    vi.mocked(retrieveIDPIntent).mockRejectedValue(new Error("Errors.Intent.Expired"));

    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/idp/oidc/registration-failed?organization=org-walther&requestId=oidc_request");
    expect(RegisterFormIDPIncomplete).not.toHaveBeenCalled();
  });

  test("still refuses a request without the intent parameters", async () => {
    const { token: _token, ...withoutToken } = searchParams;

    await expect(renderPage(withoutToken)).rejects.toThrow("Missing required parameters");
    expect(retrieveIDPIntent).not.toHaveBeenCalled();
  });
});
