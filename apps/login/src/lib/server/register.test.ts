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
  retrieveIDPIntent: vi.fn(),
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
};

function intentFor({
  idpId = IDP_ID,
  externalUserId = "qes-sub-1",
  externalUserName = "",
  userId = "",
  profile = { givenName: "Erika", familyName: "Mustermann" } as { givenName?: string; familyName?: string },
} = {}) {
  return {
    idpInformation: { idpId, userId: externalUserId, userName: externalUserName },
    userId,
    userAction: {
      case: "createUser",
      value: { userType: { case: "human", value: { profile, email: { email: "" } } } },
    },
  };
}

const session = {
  id: "session-1",
  factors: {
    user: { id: "user-1", loginName: "person@example.com", organizationId: ORG_ID },
  },
};

function newUser(emailVerified: boolean) {
  return {
    user: {
      userId: "user-1",
      type: {
        case: "human",
        value: { email: { email: "person@example.com", isVerified: emailVerified } },
      },
    },
  };
}

describe("registerUserAndLinkToIDP", () => {
  let zitadel: typeof import("../zitadel");
  let cookie: typeof import("./cookie");
  let client: typeof import("../client");
  let mfaHelper: typeof import("../mfa-helper");
  let verify: typeof import("./verify");

  beforeEach(async () => {
    zitadel = await import("../zitadel");
    cookie = await import("./cookie");
    client = await import("../client");
    mfaHelper = await import("../mfa-helper");
    verify = await import("./verify");

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
    vi.mocked(zitadel.retrieveIDPIntent).mockResolvedValue(intentFor() as any);
    vi.mocked(zitadel.addHumanUser).mockResolvedValue({ userId: "user-1" } as any);
    vi.mocked(zitadel.addIDPLink).mockResolvedValue({} as any);
    vi.mocked(zitadel.listAuthenticationMethodTypes).mockResolvedValue({ authMethodTypes: [] } as any);
    vi.mocked(cookie.createSessionForIdpAndUpdateCookie).mockResolvedValue(session as any);
    vi.mocked(zitadel.getUserByID).mockResolvedValue(newUser(false) as any);
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

  describe("the external identity and the names come from the intent (P3)", () => {
    test("creates the account with the names of the intent, not the submitted ones", async () => {
      const result = await registerUserAndLinkToIDP({ ...idpCommand, firstName: "Mallory", lastName: "Forged" });

      expect(result).toEqual({ redirect: "https://wiki.example.com/callback" });
      expect(zitadel.retrieveIDPIntent).toHaveBeenCalledWith({
        serviceConfig: expect.anything(),
        id: "intent-1",
        token: "intent-token-1",
      });
      expect(zitadel.addHumanUser).toHaveBeenCalledWith({
        serviceConfig: expect.anything(),
        email: "person@example.com",
        firstName: "Erika",
        lastName: "Mustermann",
        organization: ORG_ID,
      });
    });

    test("takes a name from the form only where the provider sent none", async () => {
      vi.mocked(zitadel.retrieveIDPIntent).mockResolvedValue(intentFor({ profile: { givenName: "Erika" } }) as any);

      await registerUserAndLinkToIDP({ ...idpCommand, firstName: "Mallory", lastName: "Musterfrau" });

      expect(zitadel.addHumanUser).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: "Erika", lastName: "Musterfrau" }),
      );
    });

    test("links the identity of the intent, named by the entered address when the provider sends no user name", async () => {
      await registerUserAndLinkToIDP(idpCommand);

      expect(zitadel.addIDPLink).toHaveBeenCalledWith({
        serviceConfig: expect.anything(),
        idp: { id: IDP_ID, userId: "qes-sub-1", userName: "person@example.com" },
        userId: "user-1",
      });
    });

    test("names the link with the provider's user name when it sends one", async () => {
      vi.mocked(zitadel.retrieveIDPIntent).mockResolvedValue(intentFor({ externalUserName: "erika.m" }) as any);

      await registerUserAndLinkToIDP(idpCommand);

      expect(zitadel.addIDPLink).toHaveBeenCalledWith(
        expect.objectContaining({ idp: { id: IDP_ID, userId: "qes-sub-1", userName: "erika.m" } }),
      );
    });

    test("refuses an intent of another external user", async () => {
      vi.mocked(zitadel.retrieveIDPIntent).mockResolvedValue(intentFor({ externalUserId: "qes-sub-2" }) as any);

      const result = await registerUserAndLinkToIDP(idpCommand);

      expect(result).toEqual({ error: "errors.couldNotLinkIDP" });
      expect(zitadel.addHumanUser).not.toHaveBeenCalled();
      expect(zitadel.addIDPLink).not.toHaveBeenCalled();
    });

    test("refuses an intent of another identity provider", async () => {
      vi.mocked(zitadel.retrieveIDPIntent).mockResolvedValue(intentFor({ idpId: "another-idp" }) as any);

      const result = await registerUserAndLinkToIDP(idpCommand);

      expect(result).toEqual({ error: "errors.couldNotLinkIDP" });
      expect(zitadel.addHumanUser).not.toHaveBeenCalled();
    });

    test("refuses an intent whose external identity belongs to an account already", async () => {
      vi.mocked(zitadel.retrieveIDPIntent).mockResolvedValue(intentFor({ userId: "existing-user" }) as any);

      const result = await registerUserAndLinkToIDP(idpCommand);

      expect(result).toEqual({ error: "errors.couldNotLinkIDP" });
      expect(zitadel.addHumanUser).not.toHaveBeenCalled();
    });

    test("refuses when the intent cannot be read", async () => {
      vi.mocked(zitadel.retrieveIDPIntent).mockRejectedValue(new Error("Errors.Intent.Expired"));

      const result = await registerUserAndLinkToIDP(idpCommand);

      expect(result).toEqual({ error: "errors.couldNotRegisterUser" });
      expect(zitadel.addHumanUser).not.toHaveBeenCalled();
    });
  });

  describe("the email code right after the registration (P2)", () => {
    beforeEach(() => {
      vi.stubEnv("EMAIL_VERIFICATION", "true");
      vi.mocked(verify.trySendVerification).mockResolvedValue(true);
      vi.mocked(mfaHelper.checkMFAFactors).mockResolvedValue({ redirect: "/mfa/set?force=true" });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    test("sends the first code once and asks for it before any MFA step", async () => {
      const result = await registerUserAndLinkToIDP(idpCommand);

      expect(result).toHaveProperty("redirect");
      const url = new URL((result as { redirect: string }).redirect, "https://login.example.com");
      expect(url.pathname).toBe("/verify");
      expect(url.searchParams.get("codeSent")).toBe("true");
      expect(url.searchParams.get("loginName")).toBe("person@example.com");
      expect(url.searchParams.get("organization")).toBe(ORG_ID);
      expect(url.searchParams.get("requestId")).toBe("oidc_request");

      expect(verify.trySendVerification).toHaveBeenCalledTimes(1);
      expect(verify.trySendVerification).toHaveBeenCalledWith({
        userId: "user-1",
        isInvite: false,
        requestId: "oidc_request",
      });
      expect(mfaHelper.checkMFAFactors).not.toHaveBeenCalled();
      expect(client.completeFlowOrGetUrl).not.toHaveBeenCalled();
    });

    test("leaves codeSent off when the code could not be sent, so /verify offers to send it again", async () => {
      vi.mocked(verify.trySendVerification).mockResolvedValue(false);

      const result = await registerUserAndLinkToIDP(idpCommand);

      const url = new URL((result as { redirect: string }).redirect, "https://login.example.com");
      expect(url.pathname).toBe("/verify");
      expect(url.searchParams.has("codeSent")).toBe(false);
      expect(verify.trySendVerification).toHaveBeenCalledTimes(1);
    });

    test("goes on to the MFA checks when the address is verified already", async () => {
      vi.mocked(zitadel.getUserByID).mockResolvedValue(newUser(true) as any);

      const result = await registerUserAndLinkToIDP(idpCommand);

      expect(result).toEqual({ redirect: "/mfa/set?force=true" });
      expect(verify.trySendVerification).not.toHaveBeenCalled();
      expect(mfaHelper.checkMFAFactors).toHaveBeenCalledTimes(1);
    });

    test("asks for no code when EMAIL_VERIFICATION is not true", async () => {
      vi.stubEnv("EMAIL_VERIFICATION", "false");

      const result = await registerUserAndLinkToIDP(idpCommand);

      expect(result).toEqual({ redirect: "/mfa/set?force=true" });
      expect(verify.trySendVerification).not.toHaveBeenCalled();
    });

    test("answers userNotFound when the new account cannot be read back", async () => {
      vi.mocked(zitadel.getUserByID).mockRejectedValue(new Error("unavailable"));

      const result = await registerUserAndLinkToIDP(idpCommand);

      expect(result).toEqual({ error: "errors.userNotFound" });
      expect(verify.trySendVerification).not.toHaveBeenCalled();
      expect(mfaHelper.checkMFAFactors).not.toHaveBeenCalled();
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
