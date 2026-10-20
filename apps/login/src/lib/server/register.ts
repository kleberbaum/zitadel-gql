"use server";

import { createSessionAndUpdateCookie, createSessionForIdpAndUpdateCookie } from "@/lib/server/cookie";
import {
  addHumanUser,
  addIDPLink,
  getActiveIdentityProviders,
  getIDPByID,
  getLoginSettings,
  getUserByID,
  listAuthenticationMethodTypes,
  retrieveIDPIntent,
  ServiceConfig,
} from "@/lib/zitadel";
import { Code, ConnectError, create, Duration } from "@zitadel/client";
import { Factors } from "@zitadel/proto/zitadel/session/v2/session_pb";
import { Checks, ChecksJson, ChecksSchema } from "@zitadel/proto/zitadel/session/v2/session_service_pb";
import { LoginSettings } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import crypto from "crypto";
import { getTranslations } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { completeFlowOrGetUrl } from "../client";
import { getOrSetFingerprintId } from "../fingerprint";
import { idpIntentNames } from "../idp";
import { createLogger } from "../logger";
import { getServiceConfig } from "../service-url";
import { checkEmailVerification, checkMFAFactors } from "../verify-helper";

const logger = createLogger("register");

const MAX_SESSION_RETRIES = 3;
const RETRY_DELAYS_MS = [500, 1000, 2000];

/**
 * After user creation, backend projections (users, login_names) may not be updated yet.
 * This helper retries createSessionAndUpdateCookie on NotFound errors with increasing delays.
 */
async function createSessionWithRetry(command: { checks: Checks; requestId: string | undefined; lifetime?: Duration }) {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_SESSION_RETRIES; attempt++) {
    try {
      return await createSessionAndUpdateCookie(command);
    } catch (error) {
      lastError = error;
      const isNotFound = error instanceof ConnectError && error.code === Code.NotFound;
      const isLastAttempt = attempt + 1 >= MAX_SESSION_RETRIES;
      if (!isNotFound || isLastAttempt) {
        throw error;
      }
      const delay = RETRY_DELAYS_MS[attempt] ?? 2000;
      logger.warn(
        `Session creation failed with NotFound (attempt ${attempt + 1}/${MAX_SESSION_RETRIES}), retrying in ${delay}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

type RegisterUserCommand = {
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
  organization: string;
  requestId?: string;
};

export type RegisterUserResponse = {
  userId: string;
  sessionId: string;
  factors: Factors | undefined;
};
export async function registerUser(
  command: RegisterUserCommand,
): Promise<{ error: string } | { redirect: string } | { samlData: { url: string; fields: Record<string, string> } }> {
  const t = await getTranslations("register");
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  const loginSettings = await getLoginSettings({ serviceConfig, organization: command.organization });

  if (!loginSettings) {
    return { error: t("errors.couldNotGetLoginSettings") };
  }

  if (!loginSettings.allowRegister) {
    return { error: t("errors.registerNotAllowed") };
  }

  if (command.password && !loginSettings.allowLocalAuthentication) {
    return { error: t("errors.localAuthenticationNotAllowed") };
  }

  const addResponse = await addHumanUser({
    serviceConfig,
    email: command.email,
    firstName: command.firstName,
    lastName: command.lastName,
    password: command.password ? command.password : undefined,
    organization: command.organization,
  }).catch((error) => {
    logger.error("Failed to create user", { error });
    return null;
  });

  if (!addResponse) {
    return { error: t("errors.couldNotCreateUser") };
  }

  let checkPayload: any = {
    user: { search: { case: "userId", value: addResponse.userId } },
  };

  if (command.password) {
    checkPayload = {
      ...checkPayload,
      password: { password: command.password },
    } as ChecksJson;
  }

  const checks = create(ChecksSchema, checkPayload);

  const result = await createSessionWithRetry({
    checks,
    requestId: command.requestId,
    lifetime: command.password ? loginSettings?.passwordCheckLifetime : undefined,
  }).catch((error) => {
    logger.error("Failed to create session after user creation", { error });
    return null;
  });

  const session = result?.session;

  if (!session || !session.factors?.user) {
    return { error: t("errors.couldNotCreateSession") };
  }

  if (!command.password) {
    const params = new URLSearchParams({
      loginName: session.factors.user.loginName,
      organization: session.factors.user.organizationId,
    });

    if (command.requestId) {
      params.append("requestId", command.requestId);
    }

    // Set verification cookie for users registering with passkey (no password)
    // This allows them to proceed with passkey registration without additional verification
    const cookiesList = await cookies();
    const userAgentId = await getOrSetFingerprintId();

    const verificationCheck = crypto.createHash("sha256").update(`${session.factors.user.id}:${userAgentId}`).digest("hex");

    await cookiesList.set({
      name: "verificationCheck",
      value: verificationCheck,
      httpOnly: true,
      path: "/",
      maxAge: 300, // 5 minutes
    });

    return { redirect: "/passkey/set?" + params };
  } else {
    const userResponse = await getUserByID({ serviceConfig, userId: session?.factors?.user?.id }).catch((error) => {
      logger.error("Failed to get user after session creation", { error });
      return null;
    });

    if (!userResponse?.user) {
      return { error: t("errors.userNotFound") };
    }

    const humanUser = userResponse.user.type.case === "human" ? userResponse.user.type.value : undefined;

    const emailVerificationCheck = await checkEmailVerification(
      session,
      humanUser,
      session.factors.user.organizationId,
      command.requestId,
    );

    if (emailVerificationCheck?.redirect) {
      return emailVerificationCheck;
    }

    return completeFlowOrGetUrl(
      command.requestId && session.id
        ? {
            sessionId: session.id,
            requestId: command.requestId,
            organization: session.factors.user.organizationId,
          }
        : {
            loginName: session.factors.user.loginName,
            organization: session.factors.user.organizationId,
          },
      loginSettings?.defaultRedirectUri,
    );
  }
}

type RegisterUserAndLinkToIDPommand = {
  email: string;
  // The names are used only where the identity provider sent none, see
  // registerUserAndLinkToIDP.
  firstName: string;
  lastName: string;
  organization: string;
  requestId?: string;
  idpIntent: {
    idpIntentId: string;
    idpIntentToken: string;
  };
  idpUserId: string;
  idpId: string;
};

export type registerUserAndLinkToIDPResponse = {
  userId: string;
  sessionId: string;
  factors: Factors | undefined;
};

/**
 * Whether a person may create an account through an identity provider while
 * signing in with it. Login V1 allows this whenever the provider allows
 * creation, even with the password self-registration of the organization
 * closed, and so does this check. The provider is read from Zitadel by its id,
 * its options are never taken from the client, and it has to be active on the
 * login policy of the organization the account is created in.
 */
async function isIDPRegistrationAllowed({
  serviceConfig,
  loginSettings,
  organization,
  idpId,
}: {
  serviceConfig: ServiceConfig;
  loginSettings: LoginSettings;
  organization: string;
  idpId: string;
}): Promise<boolean> {
  if (!loginSettings.allowExternalIdp) {
    return false;
  }

  if (loginSettings.allowRegister) {
    return true;
  }

  const idp = await getIDPByID({ serviceConfig, id: idpId }).catch((error) => {
    logger.error("Failed to read the identity provider", { error });
    return undefined;
  });

  const options = idp?.config?.options;
  if (!options?.isCreationAllowed && !options?.isAutoCreation) {
    return false;
  }

  const activeIDPs = await getActiveIdentityProviders({ serviceConfig, orgId: organization }).catch((error) => {
    logger.error("Failed to read the active identity providers", { error });
    return undefined;
  });

  return !!activeIDPs?.identityProviders?.some((activeIDP) => activeIDP.id === idpId);
}

export async function registerUserAndLinkToIDP(
  command: RegisterUserAndLinkToIDPommand,
): Promise<{ error: string } | { redirect: string } | { samlData: { url: string; fields: Record<string, string> } }> {
  const t = await getTranslations("register");

  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  const loginSettings = await getLoginSettings({ serviceConfig, organization: command.organization });

  if (!loginSettings) {
    return { error: t("errors.couldNotGetLoginSettings") };
  }

  const registrationAllowed = await isIDPRegistrationAllowed({
    serviceConfig,
    loginSettings,
    organization: command.organization,
    idpId: command.idpId,
  });

  if (!registrationAllowed) {
    return { error: t("errors.registerNotAllowed") };
  }

  // The intent is the trusted source of the external identity and of the
  // names the provider sent, so it is read again here instead of believing
  // the form. Reading it does not consume it, the session check below does.
  // It has to be the intent the form was rendered for and must not belong to
  // an account yet.
  const intent = await retrieveIDPIntent({
    serviceConfig,
    id: command.idpIntent.idpIntentId,
    token: command.idpIntent.idpIntentToken,
  }).catch((error) => {
    logger.error("Failed to read the IDP intent", { error });
    return null;
  });

  if (!intent) {
    return { error: t("errors.couldNotRegisterUser") };
  }

  const idpInformation = intent.idpInformation;

  if (
    !idpInformation ||
    intent.userId ||
    idpInformation.idpId !== command.idpId ||
    idpInformation.userId !== command.idpUserId
  ) {
    return { error: t("errors.couldNotLinkIDP") };
  }

  // A name the provider sent is taken as sent, the form shows it read only.
  // Only a name it did not send comes from the form.
  const names = idpIntentNames(intent);

  const addUserResponse = await addHumanUser({
    serviceConfig,
    email: command.email,
    firstName: names.givenName ?? command.firstName,
    lastName: names.familyName ?? command.lastName,
    organization: command.organization,
  });

  const idpLink = await addIDPLink({
    serviceConfig,
    idp: {
      id: idpInformation.idpId,
      userId: idpInformation.userId,
      // Zitadel requires a user name on a link. A provider that sends no
      // preferred_username (qes-oidc for ID Austria sends none) gets the
      // address the person entered, which is the account's username as well.
      userName: idpInformation.userName || command.email,
    },
    userId: addUserResponse.userId,
  });

  if (!idpLink) {
    return { error: t("errors.couldNotLinkIDP") };
  }

  const session = await createSessionForIdpAndUpdateCookie({
    requestId: command.requestId,
    userId: addUserResponse.userId, // the user we just created
    idpIntent: command.idpIntent,
    lifetime: loginSettings?.externalLoginCheckLifetime,
  });

  if (!session || !session.factors?.user) {
    return { error: t("errors.couldNotCreateSession") };
  }

  // The new account's email address is unverified. Ask for the code now,
  // before any MFA step, as the sign-in of an existing user through an
  // identity provider does (createNewSessionFromIdpIntent). The check sends
  // the first code itself and passes codeSent=true to /verify, which
  // therefore does not send another one (#11995).
  const userResponse = await getUserByID({ serviceConfig, userId: session.factors.user.id }).catch((error) => {
    logger.error("Failed to get user after session creation", { error });
    return null;
  });

  if (!userResponse?.user) {
    return { error: t("errors.userNotFound") };
  }

  const humanUser = userResponse.user.type.case === "human" ? userResponse.user.type.value : undefined;

  const emailVerificationCheck = await checkEmailVerification(session, humanUser, command.organization, command.requestId);

  if (emailVerificationCheck?.redirect) {
    return emailVerificationCheck;
  }

  // check if user has MFA methods
  let authMethods;
  if (session.factors?.user?.id) {
    const response = await listAuthenticationMethodTypes({ serviceConfig, userId: session.factors.user.id });
    if (response.authMethodTypes && response.authMethodTypes.length) {
      authMethods = response.authMethodTypes;
    }
  }

  // Always check MFA factors, even if no auth methods are configured
  // This ensures that force MFA settings are respected
  const mfaFactorCheck = await checkMFAFactors(
    serviceConfig,
    session,
    loginSettings,
    authMethods || [], // Pass empty array if no auth methods
    command.organization,
    command.requestId,
  );

  if (mfaFactorCheck?.redirect) {
    return mfaFactorCheck;
  }

  return completeFlowOrGetUrl(
    command.requestId && session.id
      ? {
          sessionId: session.id,
          requestId: command.requestId,
          organization: session.factors.user.organizationId,
        }
      : {
          loginName: session.factors.user.loginName,
          organization: session.factors.user.organizationId,
        },
    loginSettings?.defaultRedirectUri,
  );
}
