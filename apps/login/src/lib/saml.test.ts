import { beforeEach, describe, expect, test, vi } from "vitest";
import { loginWithSAMLAndSession } from "./saml";
import { sendLoginname } from "./server/loginname";
import { isSessionValid } from "./session";
import { createResponse } from "./zitadel";

vi.mock("./session");
vi.mock("./zitadel");
vi.mock("./server/loginname");
vi.mock("@/lib/grpc/interceptors/error-classification", () => ({
  isClassifiedError: (error: unknown): boolean =>
    typeof error === "object" && error !== null && "code" in error && typeof (error as any).code === "number",
}));

vi.mock("@zitadel/client", () => ({
  Code: { FailedPrecondition: 9 },
  create: vi.fn(),
}));

describe("loginWithSAMLAndSession", () => {
  const serviceConfig = { baseUrl: "https://zitadel.example.com" };
  let sessions: any[];
  const sessionCookies = [{ id: "session-1", token: "token-1", loginName: "person@example.com" }] as any;

  function login() {
    return loginWithSAMLAndSession({
      serviceConfig,
      samlRequest: "saml-1",
      sessionId: "session-1",
      sessions,
      sessionCookies,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    sessions = [
      {
        id: "session-1",
        factors: {
          user: { id: "user-1", loginName: "person@example.com", organizationId: "org-1" },
          webAuthN: { verifiedAt: { seconds: BigInt(Math.floor(Date.now() / 1000)) } },
        },
      },
    ];
    vi.mocked(createResponse).mockResolvedValue({
      url: "https://sp.example.com/acs",
      binding: { case: "redirect", value: {} },
    } as any);
  });

  test("answers the request with a session that counts as signed in", async () => {
    vi.mocked(isSessionValid).mockResolvedValue(true);

    expect(await login()).toEqual({ redirect: "https://sp.example.com/acs" });
    expect(createResponse).toHaveBeenCalledTimes(1);
  });

  describe("a session that isSessionValid rejects never answers the request", () => {
    beforeEach(() => {
      vi.mocked(isSessionValid).mockResolvedValue(false);
    });

    test("the person signs in again where sendLoginname sends them", async () => {
      vi.mocked(sendLoginname).mockResolvedValue({ redirect: "/passkey?loginName=person%40example.com" });

      expect(await login()).toEqual({ redirect: "/passkey?loginName=person%40example.com" });
      expect(sendLoginname).toHaveBeenCalledWith({
        loginName: "person@example.com",
        organization: "org-1",
        requestId: "saml_saml-1",
      });
      expect(createResponse).not.toHaveBeenCalled();
    });

    test("not when sendLoginname answers with an error", async () => {
      vi.mocked(sendLoginname).mockResolvedValue({ error: "errors.userNotActive" });

      expect(await login()).toEqual({ error: "errors.userNotActive" });
      expect(createResponse).not.toHaveBeenCalled();
    });

    test("not when sendLoginname has no next step", async () => {
      vi.mocked(sendLoginname).mockResolvedValue(undefined as any);

      expect(await login()).toEqual({ error: "Session not found or invalid" });
      expect(createResponse).not.toHaveBeenCalled();
    });

    test("not when the session names no user", async () => {
      sessions[0].factors = { webAuthN: sessions[0].factors.webAuthN };

      expect(await login()).toEqual({ error: "Session not found or invalid" });
      expect(sendLoginname).not.toHaveBeenCalled();
      expect(createResponse).not.toHaveBeenCalled();
    });
  });
});
