// @vitest-environment node
import { PasskeysType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { allowsPasskeyRegistration, isPasskeyRegistrationEnabled } from "./passkey-registration";

const closedWithPasskeys = {
  allowRegister: false,
  allowExternalIdp: true,
  allowLocalAuthentication: true,
  passkeysType: PasskeysType.ALLOWED,
} as any;

describe("PASSKEY_REGISTRATION", () => {
  beforeEach(() => {
    vi.stubEnv("PASSKEY_REGISTRATION", "true");
    vi.stubEnv("EMAIL_VERIFICATION", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("is read at request time, not when the module loads", () => {
    expect(isPasskeyRegistrationEnabled()).toBe(true);

    vi.stubEnv("PASSKEY_REGISTRATION", "false");
    expect(isPasskeyRegistrationEnabled()).toBe(false);
  });

  test("is off unless set to true", () => {
    for (const value of ["", "1", "yes", "on", "false"]) {
      vi.stubEnv("PASSKEY_REGISTRATION", value);
      expect(isPasskeyRegistrationEnabled()).toBe(false);
    }
  });

  test("needs EMAIL_VERIFICATION, which asks for the code", () => {
    vi.stubEnv("EMAIL_VERIFICATION", "false");

    expect(isPasskeyRegistrationEnabled()).toBe(false);
    expect(allowsPasskeyRegistration(closedWithPasskeys)).toBe(false);
  });

  test("lets an organization with closed self-registration and passkeys allowed register with a passkey", () => {
    expect(allowsPasskeyRegistration(closedWithPasskeys)).toBe(true);
  });

  test("leaves an organization that does not allow passkeys closed", () => {
    expect(allowsPasskeyRegistration({ ...closedWithPasskeys, passkeysType: PasskeysType.NOT_ALLOWED })).toBe(false);
  });

  test("leaves an organization with open self-registration to upstream's registration", () => {
    expect(allowsPasskeyRegistration({ ...closedWithPasskeys, allowRegister: true })).toBe(false);
  });

  test("answers false without login settings", () => {
    expect(allowsPasskeyRegistration(undefined)).toBe(false);
  });

  test("answers false without PASSKEY_REGISTRATION", () => {
    vi.stubEnv("PASSKEY_REGISTRATION", "");

    expect(allowsPasskeyRegistration(closedWithPasskeys)).toBe(false);
  });
});
