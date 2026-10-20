import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RegisterFormIDPIncomplete } from "./register-form-idp-incomplete";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/server/register", () => ({
  registerUserAndLinkToIDP: vi.fn(),
}));

vi.mock("@/lib/client", () => ({
  handleServerActionResponse: vi.fn(),
}));

const defaultProps = {
  organization: "org-1",
  idpIntent: { idpIntentId: "intent-1", idpIntentToken: "token-1" },
  idpUserId: "user-1",
  idpId: "idp-1",
};

describe("RegisterFormIDPIncomplete", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("shows no username input, the action never used it as the account's username", () => {
    const { queryByTestId } = render(<RegisterFormIDPIncomplete {...defaultProps} />);
    expect(queryByTestId("username-text-input")).toBeNull();
  });

  test("lets the person enter the names when the identity provider sent none", () => {
    const { getByTestId } = render(<RegisterFormIDPIncomplete {...defaultProps} />);

    expect(getByTestId("firstname-text-input")).not.toHaveAttribute("readonly");
    expect(getByTestId("lastname-text-input")).not.toHaveAttribute("readonly");
    expect(getByTestId("firstname-text-input")).toHaveFocus();
  });

  test("shows the names the identity provider sent read only and asks only for the email address", () => {
    const { getByTestId } = render(
      <RegisterFormIDPIncomplete {...defaultProps} idpNames={{ givenName: "Erika", familyName: "Mustermann" }} />,
    );

    expect(getByTestId("firstname-text-input")).toHaveValue("Erika");
    expect(getByTestId("firstname-text-input")).toHaveAttribute("readonly");
    expect(getByTestId("lastname-text-input")).toHaveValue("Mustermann");
    expect(getByTestId("lastname-text-input")).toHaveAttribute("readonly");
    expect(getByTestId("email-text-input")).not.toHaveAttribute("readonly");
    expect(getByTestId("email-text-input")).toHaveFocus();
  });

  test("keeps a name the identity provider did not send editable", () => {
    const { getByTestId } = render(<RegisterFormIDPIncomplete {...defaultProps} idpNames={{ givenName: "Erika" }} />);

    expect(getByTestId("firstname-text-input")).toHaveAttribute("readonly");
    expect(getByTestId("lastname-text-input")).not.toHaveAttribute("readonly");
    expect(getByTestId("lastname-text-input")).toHaveFocus();
  });

  test("submits the email address with the identity of the intent", async () => {
    const { registerUserAndLinkToIDP } = await import("@/lib/server/register");
    vi.mocked(registerUserAndLinkToIDP).mockResolvedValue({ redirect: "/verify" });

    const { getByTestId } = render(
      <RegisterFormIDPIncomplete
        {...defaultProps}
        idpNames={{ givenName: "Erika", familyName: "Mustermann" }}
        requestId="oidc_request"
      />,
    );

    fireEvent.input(getByTestId("email-text-input"), { target: { value: "erika@example.com" } });
    await waitFor(() => expect(getByTestId("submit-button")).not.toBeDisabled());
    fireEvent.click(getByTestId("submit-button"));

    await waitFor(() => expect(registerUserAndLinkToIDP).toHaveBeenCalledTimes(1));
    expect(registerUserAndLinkToIDP).toHaveBeenCalledWith({
      idpId: "idp-1",
      idpUserId: "user-1",
      email: "erika@example.com",
      firstName: "Erika",
      lastName: "Mustermann",
      organization: "org-1",
      requestId: "oidc_request",
      idpIntent: { idpIntentId: "intent-1", idpIntentToken: "token-1" },
    });
  });
});
