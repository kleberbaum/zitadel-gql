/**
 * The approval of a device authorization runs the real isSessionValid, with
 * Zitadel faked. Zitadel itself approves with any active session and its
 * token, so this check decides.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  authorizeOrDenyDeviceAuthorization,
  getLoginSettings,
  getSession,
  getUserByID,
  listAuthenticationMethodTypes,
} from "../zitadel";
import { completeDeviceAuthorization } from "./device";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("../service-url", () => ({
  getServiceConfig: vi.fn(() => ({ serviceConfig: { baseUrl: "https://zitadel.test" } })),
}));

vi.mock("../zitadel", () => ({
  authorizeOrDenyDeviceAuthorization: vi.fn(),
  getLoginSettings: vi.fn(),
  getSession: vi.fn(),
  getUserByID: vi.fn(),
  listAuthenticationMethodTypes: vi.fn(),
}));

vi.mock("../cookies", () => ({
  getMostRecentCookieWithLoginname: vi.fn(),
}));

vi.mock("../fingerprint", () => ({
  getFingerprintIdCookie: vi.fn(),
}));

vi.mock("./verify", () => ({
  trySendVerification: vi.fn(),
}));

const user = { id: "user-1", loginName: "person@example.com", organizationId: "org-1" };
const verifiedAt = { seconds: BigInt(Math.floor(Date.now() / 1000)), nanos: 0 };
const cookieSession = { sessionId: "session-1", sessionToken: "token-1" };

describe("completeDeviceAuthorization", () => {
  beforeEach(() => {
    vi.mocked(getLoginSettings).mockResolvedValue({} as any);
    vi.mocked(listAuthenticationMethodTypes).mockResolvedValue({
      authMethodTypes: [],
    } as any);
    vi.mocked(authorizeOrDenyDeviceAuthorization).mockResolvedValue({} as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  test("approves with a session that counts as signed in", async () => {
    vi.mocked(getSession).mockResolvedValue({
      session: { id: "session-1", factors: { user, webAuthN: { verifiedAt, userVerified: true } } },
    } as any);

    const result = await completeDeviceAuthorization("device-1", cookieSession);

    expect(result).not.toHaveProperty("error");
    expect(getSession).toHaveBeenCalledWith({ serviceConfig: expect.anything(), ...cookieSession });
    expect(authorizeOrDenyDeviceAuthorization).toHaveBeenCalledWith({
      serviceConfig: expect.anything(),
      deviceAuthorizationId: "device-1",
      session: cookieSession,
    });
  });

  test("approves nothing with a session that only names the user", async () => {
    vi.mocked(getSession).mockResolvedValue({ session: { id: "session-1", factors: { user } } } as any);

    const result = await completeDeviceAuthorization("device-1", cookieSession);

    expect(result).toEqual({ error: "Session not found or invalid" });
    expect(authorizeOrDenyDeviceAuthorization).not.toHaveBeenCalled();
  });

  test("approves nothing while the email address of a new account is unconfirmed", async () => {
    vi.stubEnv("EMAIL_VERIFICATION", "true");
    vi.mocked(getSession).mockResolvedValue({
      session: { id: "session-1", factors: { user, webAuthN: { verifiedAt, userVerified: true } } },
    } as any);
    vi.mocked(getUserByID).mockResolvedValue({
      user: { userId: "user-1", type: { case: "human", value: { email: { isVerified: false } } } },
    } as any);

    const result = await completeDeviceAuthorization("device-1", cookieSession);

    expect(result).toEqual({ error: "Session not found or invalid" });
    expect(authorizeOrDenyDeviceAuthorization).not.toHaveBeenCalled();
  });

  test("approves nothing with a session that cannot be loaded", async () => {
    vi.mocked(getSession).mockRejectedValue(new Error("not found"));

    const result = await completeDeviceAuthorization("device-1", cookieSession);

    expect(result).toEqual({ error: "Session not found or invalid" });
    expect(authorizeOrDenyDeviceAuthorization).not.toHaveBeenCalled();
  });

  test("denies without a session, as before", async () => {
    await completeDeviceAuthorization("device-1");

    expect(getSession).not.toHaveBeenCalled();
    expect(authorizeOrDenyDeviceAuthorization).toHaveBeenCalledWith({
      serviceConfig: expect.anything(),
      deviceAuthorizationId: "device-1",
      session: undefined,
    });
  });
});
