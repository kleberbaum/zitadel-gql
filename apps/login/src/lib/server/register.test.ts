import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { registerUser, registerUserAndLinkToIDP } from "./register";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => (key: string) => key),
}));

vi.mock("@zitadel/client", () => ({
  create: vi.fn((_schema: unknown, data: unknown) => data),
  ConnectError: class extends Error {
    code: unknown;
    constructor(message: string, code: unknown) {
      super(message);
      this.code = code;
    }
  },
  Code: {
    NotFound: 5,
  },
}));

vi.mock("../service-url", () => ({
  getServiceConfig: vi.fn(() => ({ serviceConfig: { baseUrl: "https://zitadel.test" } })),
}));

vi.mock("../zitadel", () => ({
  addHumanUser: vi.fn(),
  addIDPLink: vi.fn(),
  getActiveIdentityProviders: vi.fn(),
  getIDPByID: vi.fn(),
  getLoginSettings: vi.fn(),
  getUserByID: vi.fn(),
  listAuthenticationMethodTypes: vi.fn(),
}));

vi.mock("./cookie", () => ({
  createSessionAndUpdateCookie: vi.fn(),
  createSessionForIdpAndUpdateCookie: vi.fn(),
}));

vi.mock("../client", () => ({
  completeFlowOrGetUrl: vi.fn(),
}));

vi.mock("../fingerprint", () => ({
  getOrSetFingerprintId: vi.fn(),
  getFingerprintIdCookie: vi.fn(),
}));

vi.mock("../mfa-helper", () => ({
  checkMFAFactors: vi.fn(),
  shouldEnforceMFA: vi.fn(),
}));

vi.mock("./verify", () => ({
  trySendVerification: vi.fn(),
}));

const IDP_ID = "idp-id-austria";
const ORG_ID = "org-walther";

const idpCommand = {
  email: "person@example.com",
  firstName: "Erika",
  lastName: "Mustermann",
  organization: ORG_ID,
  requestId: "oidc_request",
  idpIntent: { idpIntentId: "intent-1", idpIntentToken: "intent-token-1" },
  idpUserId: "qes-sub-1",
  idpId: IDP_ID,
  idpUserName: "",
};

const session = {
  id: "session-1",
  factors: {
    user: { id: "user-1", loginName: "person@example.com", organizationId: ORG_ID },
  },
};

describe("registerUserAndLinkToIDP", () => {
  let zitadel: typeof import("../zitadel");
  let cookie: typeof import("./cookie");
  let client: typeof import("../client");
  let mfaHelper: typeof import("../mfa-helper");

  beforeEach(async () => {
    zitadel = await import("../zitadel");
    cookie = await import("./cookie");
    client = await import("../client");
    mfaHelper = await import("../mfa-helper");

    vi.mocked(zitadel.getLoginSettings).mockResolvedValue({
      allowRegister: false,
      allowExternalIdp: true,
    } as any);
    vi.mocked(zitadel.getIDPByID).mockResolvedValue({
      id: IDP_ID,
      config: { options: { isCreationAllowed: true, isAutoCreation: false } },
    } as any);
    vi.mocked(zitadel.getActiveIdentityProviders).mockResolvedValue({
      identityProviders: [{ id: IDP_ID }],
    } as any);
    vi.mocked(zitadel.addHumanUser).mockResolvedValue({ userId: "user-1" } as any);
    vi.mocked(zitadel.addIDPLink).mockResolvedValue({} as any);
    vi.mocked(zitadel.listAuthenticationMethodTypes).mockResolvedValue({ authMethodTypes: [] } as any);
    vi.mocked(cookie.createSessionForIdpAndUpdateCookie).mockResolvedValue(session as any);
    vi.mocked(mfaHelper.checkMFAFactors).mockResolvedValue(undefined);
    vi.mocked(client.completeFlowOrGetUrl).mockResolvedValue({ redirect: "https://wiki.example.com/callback" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("who may register through an identity provider (P1)", () => {
    test("creates the account when self-registration is closed but the provider allows creation", async () => {
      const result = await registerUserAndLinkToIDP(idpCommand);

      expect(result).toEqual({ redirect: "https://wiki.example.com/callback" });
      expect(zitadel.getIDPByID).toHaveBeenCalledWith({ serviceConfig: expect.anything(), id: IDP_ID });
      expect(zitadel.getActiveIdentityProviders).toHaveBeenCalledWith({ serviceConfig: expect.anything(), orgId: ORG_ID });
      expect(zitadel.addHumanUser).toHaveBeenCalledTimes(1);
    });

    test("accepts a provider that creates accounts automatically", async () => {
      vi.mocked(zitadel.getIDPByID).mockResolvedValue({
        id: IDP_ID,
        config: { options: { isCreationAllowed: false, isAutoCreation: true } },
      } as any);

      const result = await registerUserAndLinkToIDP(idpCommand);

      expect(result).toEqual({ redirect: "https://wiki.example.com/callback" });
      expect(zitadel.addHumanUser).toHaveBeenCalledTimes(1);
    });

    test("refuses when the provider allows neither creation nor auto creation", async () => {
      vi.mocked(zitadel.getIDPByID).mockResolvedValue({
        id: IDP_ID,
        config: { options: { isCreationAllowed: false, isAutoCreation: false, isLinkingAllowed: true } },
      } as any);

      const result = await registerUserAndLinkToIDP(idpCommand);

      expect(result).toEqual({ error: "errors.registerNotAllowed" });
      expect(zitadel.addHumanUser).not.toHaveBeenCalled();
      expect(zitadel.addIDPLink).not.toHaveBeenCalled();
    });

    test("refuses when the provider cannot be read", async () => {
      vi.mocked(zitadel.getIDPByID).mockRejectedValue(new Error("not found"));

      const result = await registerUserAndLinkToIDP(idpCommand);

      expect(result).toEqual({ error: "errors.registerNotAllowed" });
      expect(zitadel.addHumanUser).not.toHaveBeenCalled();
    });

    test("refuses a provider that is not active on the login policy of the organization", async () => {
      vi.mocked(zitadel.getActiveIdentityProviders).mockResolvedValue({
        identityProviders: [{ id: "another-idp" }],
      } as any);

      const result = await registerUserAndLinkToIDP(idpCommand);

      expect(result).toEqual({ error: "errors.registerNotAllowed" });
      expect(zitadel.addHumanUser).not.toHaveBeenCalled();
    });

    test("refuses when external identity providers are not allowed, even with self-registration open", async () => {
      vi.mocked(zitadel.getLoginSettings).mockResolvedValue({
        allowRegister: true,
        allowExternalIdp: false,
      } as any);

      const result = await registerUserAndLinkToIDP(idpCommand);

      expect(result).toEqual({ error: "errors.registerNotAllowed" });
      expect(zitadel.addHumanUser).not.toHaveBeenCalled();
    });

    test("keeps the open self-registration path without asking the provider", async () => {
      vi.mocked(zitadel.getLoginSettings).mockResolvedValue({
        allowRegister: true,
        allowExternalIdp: true,
      } as any);

      const result = await registerUserAndLinkToIDP(idpCommand);

      expect(result).toEqual({ redirect: "https://wiki.example.com/callback" });
      expect(zitadel.getIDPByID).not.toHaveBeenCalled();
      expect(zitadel.addHumanUser).toHaveBeenCalledTimes(1);
    });

    test("answers without login settings as before", async () => {
      vi.mocked(zitadel.getLoginSettings).mockResolvedValue(undefined);

      const result = await registerUserAndLinkToIDP(idpCommand);

      expect(result).toEqual({ error: "errors.couldNotGetLoginSettings" });
      expect(zitadel.addHumanUser).not.toHaveBeenCalled();
    });
  });
});

describe("registerUser", () => {
  let zitadel: typeof import("../zitadel");

  beforeEach(async () => {
    zitadel = await import("../zitadel");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("keeps requiring open self-registration, whatever an identity provider allows", async () => {
    vi.mocked(zitadel.getLoginSettings).mockResolvedValue({
      allowRegister: false,
      allowExternalIdp: true,
      allowLocalAuthentication: true,
    } as any);
    vi.mocked(zitadel.getIDPByID).mockResolvedValue({
      id: IDP_ID,
      config: { options: { isCreationAllowed: true, isAutoCreation: true } },
    } as any);

    const result = await registerUser({
      email: "person@example.com",
      firstName: "Erika",
      lastName: "Mustermann",
      password: "Secret-Passw0rd",
      organization: ORG_ID,
    });

    expect(result).toEqual({ error: "errors.registerNotAllowed" });
    expect(zitadel.addHumanUser).not.toHaveBeenCalled();
  });
});
