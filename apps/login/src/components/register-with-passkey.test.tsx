import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { create } from "@zitadel/client";
import { LegalAndSupportSettingsSchema } from "@zitadel/proto/zitadel/settings/v2/legal_settings_pb";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RegisterWithPasskey } from "./register-with-passkey";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) => (namespace ? `${namespace}.${key}` : key),
  useLocale: () => "de",
}));

vi.mock("@/lib/server/register", () => ({
  registerUser: vi.fn(),
}));

const noLegalLinks = create(LegalAndSupportSettingsSchema, {});

const props = {
  legal: noLegalLinks,
  organization: "org-walther",
  requestId: "oidc_request",
  belowProviders: true,
};

function fillIn(getByTestId: (id: string) => HTMLElement) {
  fireEvent.input(getByTestId("firstname-text-input"), { target: { value: "Erika" } });
  fireEvent.input(getByTestId("lastname-text-input"), { target: { value: "Mustermann" } });
  fireEvent.input(getByTestId("email-text-input"), { target: { value: "erika@example.com" } });
}

describe("RegisterWithPasskey", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("is a section headed 'Mit Passkey registrieren' with the line on what a passkey is", () => {
    const { getByRole } = render(<RegisterWithPasskey {...props} />);

    const section = getByRole("region", { name: "register.passkey.title" });
    expect(within(section).getByRole("heading", { level: 2 })).toHaveTextContent("register.passkey.title");
    expect(within(section).getByText("register.passkey.description")).toBeInTheDocument();
  });

  test("asks for the given name, the family name and the email address, and offers no method to choose", () => {
    const { getByTestId, queryByTestId, queryByText } = render(<RegisterWithPasskey {...props} />);

    expect(getByTestId("firstname-text-input")).toBeInTheDocument();
    expect(getByTestId("lastname-text-input")).toBeInTheDocument();
    expect(getByTestId("email-text-input")).toBeInTheDocument();
    expect(queryByTestId("passkey-radio")).toBeNull();
    expect(queryByTestId("password-radio")).toBeNull();
    expect(queryByText("register.selectMethod")).toBeNull();
    expect(queryByText("register.noMethodAvailableWarning")).toBeNull();
  });

  test("takes no focus from the identity provider buttons above it", () => {
    const { getByTestId } = render(<RegisterWithPasskey {...props} />);

    expect(getByTestId("firstname-text-input")).not.toHaveFocus();
  });

  test("is set off from the buttons above by a line, and stands alone without one", () => {
    const { getByTestId, rerender } = render(<RegisterWithPasskey {...props} />);
    expect(getByTestId("register-passkey")).toHaveClass("border-t");

    rerender(<RegisterWithPasskey {...props} belowProviders={false} />);
    expect(getByTestId("register-passkey")).not.toHaveClass("border-t");
  });

  test("asks to accept the terms and the privacy policy as upstream's form does", async () => {
    const legal = create(LegalAndSupportSettingsSchema, {
      tosLink: "https://walther.exp.univie.ac.at/terms-of-service/",
      privacyPolicyLink: "https://walther.exp.univie.ac.at/privacy-policy/",
    });
    const { getByTestId } = render(<RegisterWithPasskey {...props} legal={legal} />);

    fillIn(getByTestId);
    await waitFor(() => expect(getByTestId("tos-checkbox")).toBeInTheDocument());
    expect(getByTestId("submit-button")).toBeDisabled();

    fireEvent.click(getByTestId("tos-checkbox"));
    fireEvent.click(getByTestId("privacy-policy-checkbox"));
    await waitFor(() => expect(getByTestId("submit-button")).not.toBeDisabled());
  });

  test("registers without a password and goes on to set up the passkey", async () => {
    const { registerUser } = await import("@/lib/server/register");
    vi.mocked(registerUser).mockResolvedValue({ redirect: "/passkey/set?loginName=erika%40example.com" });
    const { getByTestId } = render(<RegisterWithPasskey {...props} />);

    fillIn(getByTestId);
    await waitFor(() => expect(getByTestId("submit-button")).not.toBeDisabled());
    fireEvent.click(getByTestId("submit-button"));

    await waitFor(() => expect(registerUser).toHaveBeenCalledTimes(1));
    expect(registerUser).toHaveBeenCalledWith({
      email: "erika@example.com",
      firstName: "Erika",
      lastName: "Mustermann",
      organization: "org-walther",
      requestId: "oidc_request",
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/passkey/set?loginName=erika%40example.com"));
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining("/register/password"));
  });
});
