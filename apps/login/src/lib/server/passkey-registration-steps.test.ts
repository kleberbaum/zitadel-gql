/**
 * The steps after a registration with a passkey (PASSKEY_REGISTRATION): the
 * person sets up the passkey on /passkey/set, signs in with it on /passkey
 * and confirms the email address with the code. Upstream already runs the
 * email verification check after the sign-in with the new passkey, the same
 * check the registration through an identity provider runs right away, and
 * the session counts as signed in only with both steps done. These tests run
 * the real checks, with Zitadel and the cookies faked.
 */
import { PasskeysType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { completeFlowOrGetUrl } from "../client";
import { getSessionCookieByLoginName } from "../cookies";
import { loginWithOIDCAndSession } from "../oidc";
import { isSessionValid } from "../session";
import {
  createCallback,
  getLoginSettings,
  getSession,
  getUserByID,
  listAuthenticationMethodTypes,
  verifyEmail,
} from "../zitadel";
import { sendLoginname } from "./loginname";
import { sendPasskey } from "./passkeys";
import { updateOrCreateSession } from "./session";
import { sendVerification, trySendVerification } from "./verify";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => (key: string) => key),
}));

vi.mock("../service-url", () => ({
  getServiceConfig: vi.fn(() => ({ serviceConfig: { baseUrl: "https://zitadel.test" } })),
}));

vi.mock("../zitadel", () => ({
  createCallback: vi.fn(),
  createInviteCode: vi.fn(),
  createPasskeyRegistrationLink: vi.fn(),
  getLoginSettings: vi.fn(),
  getSession: vi.fn(),
  getUserByID: vi.fn(),
  listAuthenticationMethodTypes: vi.fn(),
  registerPasskey: vi.fn(),
  sendEmailCode: vi.fn(),
  verifyEmail: vi.fn(),
  verifyInviteCode: vi.fn(),
  verifyPasskeyRegistration: vi.fn(),
  verifyTOTPRegistration: vi.fn(),
}));

vi.mock("./session", () => ({
  updateOrCreateSession: vi.fn(),
}));

vi.mock("./cookie", () => ({
  createSessionAndUpdateCookie: vi.fn(),
}));

vi.mock("../cookies", () => ({
  getMostRecentCookieWithLoginname: vi.fn(),
  getSessionCookieById: vi.fn(),
  getSessionCookieByLoginName: vi.fn(),
}));

vi.mock("../client", () => ({
  completeFlowOrGetUrl: vi.fn(),
}));

vi.mock("./host", () => ({
  getPublicHost: vi.fn(() => "accounts.example.com"),
  getPublicHostWithProtocol: vi.fn(() => "https://accounts.example.com"),
}));

vi.mock("../fingerprint", () => ({
  getFingerprintIdCookie: vi.fn(),
  getOrSetFingerprintId: vi.fn(),
}));

vi.mock("./loginname", () => ({
  sendLoginname: vi.fn(),
}));

vi.mock("./verify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./verify")>()),
  trySendVerification: vi.fn(),
}));

const ORG_ID = "org-walther";
const serviceConfig = { baseUrl: "https://zitadel.test" } as any;
const user = { id: "user-1", loginName: "person@example.com", organizationId: ORG_ID };
const verifiedAt = { seconds: BigInt(Math.floor(Date.now() / 1000)), nanos: 0 };

// What registerUser leaves: a session that names the user and checked nothing.
// Setting up the passkey on /passkey/set adds no check to it either.
const afterRegistration = { id: "session-1", factors: { user } };
// After the sign-in with the new passkey on /passkey.
const afterPasskeySignIn = { id: "session-1", factors: { user, webAuthN: { verifiedAt, userVerified: true } } };

function account(emailVerified: boolean) {
  return {
    user: {
      userId: "user-1",
      preferredLoginName: "person@example.com",
      details: { resourceOwner: ORG_ID },
      type: { case: "human", value: { email: { email: "person@example.com", isVerified: emailVerified } } },
    },
  };
}

describe("the steps after a registration with a passkey (P5)", () => {
  beforeEach(() => {
    vi.stubEnv("PASSKEY_REGISTRATION", "true");
    vi.stubEnv("EMAIL_VERIFICATION", "true");
    vi.mocked(getLoginSettings).mockResolvedValue({
      allowRegister: false,
      allowExternalIdp: true,
      allowLocalAuthentication: true,
      passkeysType: PasskeysType.ALLOWED,
    } as any);
    vi.mocked(listAuthenticationMethodTypes).mockResolvedValue({
      authMethodTypes: [AuthenticationMethodType.PASSKEY],
    } as any);
    vi.mocked(trySendVerification).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  test("the sign-in with the new passkey sends the first code once and asks for it", async () => {
    vi.mocked(updateOrCreateSession).mockResolvedValue({
      sessionId: afterPasskeySignIn.id,
      factors: afterPasskeySignIn.factors,
    } as any);
    vi.mocked(getUserByID).mockResolvedValue(account(false) as any);

    const result = await sendPasskey({
      loginName: "person@example.com",
      sessionId: "session-1",
      organization: ORG_ID,
      requestId: "oidc_request",
      checks: { webAuthN: { credentialAssertionData: {} } } as any,
    });

    const url = new URL((result as { redirect: string }).redirect, "https://login.example.com");
    expect(url.pathname).toBe("/verify");
    expect(url.searchParams.get("codeSent")).toBe("true");
    expect(url.searchParams.get("loginName")).toBe("person@example.com");
    expect(url.searchParams.get("organization")).toBe(ORG_ID);
    expect(url.searchParams.get("requestId")).toBe("oidc_request");
    expect(trySendVerification).toHaveBeenCalledTimes(1);
    expect(trySendVerification).toHaveBeenCalledWith({ userId: "user-1", isInvite: false, requestId: "oidc_request" });
    expect(completeFlowOrGetUrl).not.toHaveBeenCalled();
  });

  test("the code then completes the request with the session of the passkey", async () => {
    vi.mocked(verifyEmail).mockResolvedValue({} as any);
    vi.mocked(getUserByID).mockResolvedValue(account(true) as any);
    vi.mocked(getSessionCookieByLoginName).mockResolvedValue({ id: "session-1", token: "token-1" } as any);
    vi.mocked(getSession).mockResolvedValue({ session: afterPasskeySignIn } as any);
    vi.mocked(completeFlowOrGetUrl).mockResolvedValue({ redirect: "https://wiki.example.com/callback" });

    const result = await sendVerification({
      userId: "user-1",
      loginName: "person@example.com",
      organization: ORG_ID,
      code: "123456",
      isInvite: false,
      requestId: "oidc_request",
    });

    expect(result).toEqual({ redirect: "https://wiki.example.com/callback" });
    expect(completeFlowOrGetUrl).toHaveBeenCalledWith(
      { sessionId: "session-1", requestId: "oidc_request", organization: ORG_ID },
      undefined,
    );
  });

  describe("no session of the new account counts as signed in before both steps", () => {
    test("not right after the registration, nor after the passkey is set up", async () => {
      vi.mocked(listAuthenticationMethodTypes).mockResolvedValue({ authMethodTypes: [] } as any);
      vi.mocked(getUserByID).mockResolvedValue(account(false) as any);

      expect(await isSessionValid({ serviceConfig, session: afterRegistration as any })).toBe(false);

      vi.mocked(listAuthenticationMethodTypes).mockResolvedValue({
        authMethodTypes: [AuthenticationMethodType.PASSKEY],
      } as any);

      expect(await isSessionValid({ serviceConfig, session: afterRegistration as any })).toBe(false);
    });

    test("not after the sign-in with the passkey while the email address is unconfirmed", async () => {
      vi.mocked(getUserByID).mockResolvedValue(account(false) as any);

      expect(await isSessionValid({ serviceConfig, session: afterPasskeySignIn as any })).toBe(false);
    });

    test("only with the passkey signed in and the email address confirmed", async () => {
      vi.mocked(getUserByID).mockResolvedValue(account(true) as any);

      expect(await isSessionValid({ serviceConfig, session: afterPasskeySignIn as any })).toBe(true);
    });

    test("so the request of the wiki is answered only then, and the person is sent back to sign in before", async () => {
      const sessionCookies = [{ id: "session-1", token: "token-1" }] as any;
      vi.mocked(sendLoginname).mockResolvedValue({ redirect: "/passkey?loginName=person%40example.com" } as any);
      vi.mocked(createCallback).mockResolvedValue({ callbackUrl: "https://wiki.example.com/callback?code=c" } as any);

      for (const [session, emailVerified] of [
        [afterRegistration, false],
        [afterPasskeySignIn, false],
      ] as const) {
        vi.mocked(getUserByID).mockResolvedValue(account(emailVerified) as any);

        const result = await loginWithOIDCAndSession({
          serviceConfig,
          authRequest: "request-1",
          sessionId: "session-1",
          sessions: [session as any],
          sessionCookies,
        });

        expect(result).toEqual({ redirect: "/passkey?loginName=person%40example.com" });
        expect(createCallback).not.toHaveBeenCalled();
      }

      vi.mocked(getUserByID).mockResolvedValue(account(true) as any);

      const result = await loginWithOIDCAndSession({
        serviceConfig,
        authRequest: "request-1",
        sessionId: "session-1",
        sessions: [afterPasskeySignIn as any],
        sessionCookies,
      });

      expect(result).toEqual({ redirect: "https://wiki.example.com/callback?code=c" });
      expect(createCallback).toHaveBeenCalledTimes(1);
    });

    test("nor when sendLoginname has nowhere to send the person back to", async () => {
      const sessionCookies = [{ id: "session-1", token: "token-1" }] as any;
      vi.mocked(sendLoginname).mockResolvedValue({ error: "errors.userNotActive" } as any);
      vi.mocked(createCallback).mockResolvedValue({ callbackUrl: "https://wiki.example.com/callback?code=c" } as any);
      vi.mocked(getUserByID).mockResolvedValue(account(false) as any);

      for (const session of [afterRegistration, afterPasskeySignIn]) {
        const result = await loginWithOIDCAndSession({
          serviceConfig,
          authRequest: "request-1",
          sessionId: "session-1",
          sessions: [session as any],
          sessionCookies,
        });

        expect(result).toEqual({ error: "errors.userNotActive" });
      }

      expect(createCallback).not.toHaveBeenCalled();
    });
  });
});
