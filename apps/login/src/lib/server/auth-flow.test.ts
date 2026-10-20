import { afterEach, describe, expect, test, vi } from "vitest";
import { getAllSessions } from "../cookies";
import { loginWithOIDCAndSession } from "../oidc";
import { listSessions } from "../zitadel";
import { completeAuthFlow } from "./auth-flow";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("../service-url", () => ({
  getServiceConfig: vi.fn(() => ({ serviceConfig: { baseUrl: "https://zitadel.test" } })),
}));

vi.mock("../cookies", () => ({
  getAllSessions: vi.fn(),
}));

vi.mock("../zitadel", () => ({
  listSessions: vi.fn(),
}));

vi.mock("../oidc", () => ({
  loginWithOIDCAndSession: vi.fn(),
}));

vi.mock("../saml", () => ({
  loginWithSAMLAndSession: vi.fn(),
}));

vi.mock("../logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

describe("completeAuthFlow", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("passes on the form post with which the OIDC flow sends a person to an identity provider", async () => {
    const samlData = { url: "https://idp.example.com/saml", fields: { SAMLRequest: "request" } };
    vi.mocked(getAllSessions).mockResolvedValue([{ id: "session-1", token: "token-1" }] as any);
    vi.mocked(listSessions).mockResolvedValue({ sessions: [{ id: "session-1" }] } as any);
    vi.mocked(loginWithOIDCAndSession).mockResolvedValue({ samlData });

    const result = await completeAuthFlow({ sessionId: "session-1", requestId: "oidc_request-1" });

    expect(result).toEqual({ samlData });
    expect(loginWithOIDCAndSession).toHaveBeenCalledWith(
      expect.objectContaining({ authRequest: "request-1", sessionId: "session-1" }),
    );
  });
});
