import { cleanup, render } from "@testing-library/react";
import { PasskeysType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ChooseAuthenticatorToSetup } from "./choose-authenticator-to-setup";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const bothMethods = { allowLocalAuthentication: true, passkeysType: PasskeysType.ALLOWED } as any;
const params = new URLSearchParams({ initial: "true", loginName: "erika@example.com" });

function offeredPaths(container: HTMLElement) {
  return Array.from(container.querySelectorAll("a")).map((link) => link.getAttribute("href")?.split("?")[0]);
}

describe("ChooseAuthenticatorToSetup", () => {
  afterEach(cleanup);

  test("offers a password and a passkey to an account without a way to sign in, as upstream does", () => {
    const { container } = render(
      <ChooseAuthenticatorToSetup authMethods={[]} loginSettings={bothMethods} params={params} />,
    );

    expect(offeredPaths(container)).toEqual(["/password/set", "/passkey/set"]);
  });

  test("offers only the passkey while people register with a passkey (P5)", () => {
    const { container } = render(
      <ChooseAuthenticatorToSetup authMethods={[]} loginSettings={bothMethods} params={params} passkeyOnly />,
    );

    expect(offeredPaths(container)).toEqual(["/passkey/set"]);
    expect(container.querySelector("a")?.getAttribute("href")).toBe(`/passkey/set?${params}`);
  });
});
