import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { create } from "@zitadel/client";
import { LegalAndSupportSettingsSchema } from "@zitadel/proto/zitadel/settings/v2/legal_settings_pb";
import { PasskeysType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RegisterForm } from "./register-form";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/server/register", () => ({
  registerUser: vi.fn(),
}));

vi.mock("@/lib/client", () => ({
  handleServerActionResponse: vi.fn(),
}));

const defaultLegal = create(LegalAndSupportSettingsSchema, {});

describe("RegisterForm", () => {
  afterEach(cleanup);

  test("should autofocus the firstname input on mount", () => {
    const { getByTestId } = render(<RegisterForm legal={defaultLegal} organization="org-1" idpCount={0} />);
    expect(getByTestId("firstname-text-input")).toHaveFocus();
  });
});

describe("RegisterForm for a passkey alone (P5)", () => {
  const bothMethods = { allowLocalAuthentication: true, passkeysType: PasskeysType.ALLOWED } as any;
  const passwordOnly = { allowLocalAuthentication: true, passkeysType: PasskeysType.NOT_ALLOWED } as any;

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("keeps upstream's choice of the method without passkeyOnly", () => {
    const { getByTestId } = render(
      <RegisterForm legal={defaultLegal} organization="org-1" idpCount={0} loginSettings={bothMethods} />,
    );

    expect(getByTestId("password-radio")).toBeInTheDocument();
  });

  test("offers no choice of the method, even where the login settings allow both", () => {
    const { queryByTestId } = render(
      <RegisterForm legal={defaultLegal} organization="org-1" idpCount={0} loginSettings={bothMethods} passkeyOnly />,
    );

    expect(queryByTestId("passkey-radio")).toBeNull();
    expect(queryByTestId("password-radio")).toBeNull();
  });

  test("registers without a password where upstream's form would go on to set one", async () => {
    const { registerUser } = await import("@/lib/server/register");
    vi.mocked(registerUser).mockResolvedValue({ redirect: "/passkey/set" });
    const { getByTestId } = render(
      <RegisterForm legal={defaultLegal} organization="org-1" idpCount={0} loginSettings={passwordOnly} passkeyOnly />,
    );

    fireEvent.input(getByTestId("firstname-text-input"), { target: { value: "Erika" } });
    fireEvent.input(getByTestId("lastname-text-input"), { target: { value: "Mustermann" } });
    fireEvent.input(getByTestId("email-text-input"), { target: { value: "erika@example.com" } });
    await waitFor(() => expect(getByTestId("submit-button")).not.toBeDisabled());
    fireEvent.click(getByTestId("submit-button"));

    await waitFor(() => expect(registerUser).toHaveBeenCalledTimes(1));
    expect(vi.mocked(registerUser).mock.calls[0][0]).not.toHaveProperty("password");
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining("/register/password"));
  });
});
