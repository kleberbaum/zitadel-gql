import { Alert } from "@/components/alert";
import { BackButton } from "@/components/back-button";
import { ChooseAuthenticatorToSetup } from "@/components/choose-authenticator-to-setup";
import { DynamicTheme } from "@/components/dynamic-theme";
import { LinkIdentityProviders } from "@/components/link-identity-providers";
import { SignInWithIdp } from "@/components/sign-in-with-idp";
import { Translated } from "@/components/translated";
import { UserAvatar } from "@/components/user-avatar";
import { getSessionCookieById } from "@/lib/cookies";
import { createLogger } from "@/lib/logger";
import { allowsPasskeyRegistration } from "@/lib/passkey-registration";
import { getServiceConfig } from "@/lib/service-url";
import { isSessionValid, loadMostRecentSession } from "@/lib/session";
import { checkUserVerification } from "@/lib/verify-helper";
import {
  getActiveIdentityProviders,
  getBrandingSettings,
  getLoginSettings,
  getSession,
  getUserByID,
  listAuthenticationMethodTypes,
  listIDPLinks,
} from "@/lib/zitadel";
import { Session } from "@zitadel/proto/zitadel/session/v2/session_pb";
import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
// import { getLocale } from "next-intl/server";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

const logger = createLogger("authenticator-set");

type SearchParams = Record<string | number | symbol, string | undefined>;

// The methods an account signs in with on their own, as verify.ts counts them
// when it sends an account here to set one up. A second factor alone (TOTP,
// U2F, a one-time code by SMS or email) signs nobody in.
const PRIMARY_METHODS = [AuthenticationMethodType.PASSWORD, AuthenticationMethodType.PASSKEY, AuthenticationMethodType.IDP];

function primaryMethodsOf(authMethods: AuthenticationMethodType[]) {
  return authMethods.filter((method) => PRIMARY_METHODS.includes(method));
}

/**
 * The session the page is for, with the authentication methods of its user.
 * Cached for the request, so the page and the title of its tab share one
 * lookup.
 */
const loadSessionWithData = cache(async (sessionId?: string, loginName?: string, organization?: string) => {
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  async function getAuthMethodsAndUser(session?: Session) {
    const userId = session?.factors?.user?.id;

    if (!userId) {
      throw Error("Could not get user id from session");
    }

    const methods = await listAuthenticationMethodTypes({ serviceConfig, userId });
    const user = await getUserByID({ serviceConfig, userId });

    const humanUser = user.user?.type.case === "human" ? user.user?.type.value : undefined;

    return {
      id: session?.id,
      factors: session?.factors,
      authMethods: methods.authMethodTypes ?? [],
      phoneVerified: humanUser?.phone?.isVerified ?? false,
      emailVerified: humanUser?.email?.isVerified ?? false,
      expirationDate: session?.expirationDate,
      session,
    };
  }

  async function loadSessionByLoginname(loginName?: string, organization?: string) {
    const session = await loadMostRecentSession({
      serviceConfig,
      sessionParams: {
        loginName,
        organization,
      },
    });

    return getAuthMethodsAndUser(session);
  }

  async function loadSessionById(sessionId: string, organization?: string) {
    const recent = await getSessionCookieById({ sessionId, organization });

    if (!recent) {
      return undefined;
    }

    const sessionResponse = await getSession({ serviceConfig, sessionId: recent.id, sessionToken: recent.token });
    return getAuthMethodsAndUser(sessionResponse.session);
  }

  return sessionId ? loadSessionById(sessionId, organization) : loadSessionByLoginname(loginName, organization);
});

export async function generateMetadata(props: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const t = await getTranslations("authenticator");
  const { loginName, organization, sessionId } = await props.searchParams;

  // The tab is named as the heading is. Should the lookup fail, the page
  // reports it, and the tab keeps upstream's title.
  const sessionWithData = await loadSessionWithData(sessionId, loginName, organization).catch(() => undefined);
  const hasAuthenticator = !!sessionWithData && primaryMethodsOf(sessionWithData.authMethods).length > 0;

  return { title: t(hasAuthenticator ? "linkTitle" : "title") };
}

export default async function Page(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;

  const { loginName, requestId, organization, sessionId } = searchParams;

  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  const sessionWithData = await loadSessionWithData(sessionId, loginName, organization);

  if (!sessionWithData || !sessionWithData.factors || !sessionWithData.factors.user) {
    return (
      <Alert>
        <Translated i18nKey="unknownContext" namespace="error" />
      </Alert>
    );
  }

  const branding = await getBrandingSettings({ serviceConfig, organization: sessionWithData.factors.user?.organizationId });

  const loginSettings = await getLoginSettings({
    serviceConfig,
    organization: sessionWithData.factors.user?.organizationId,
  });

  // Check if the user was verified recently (the verificationCheck cookie a
  // new account or a verified address leaves) or holds a valid session, signed
  // in with every factor the account requires. Without the second, a signed-in
  // user could neither add an authenticator here nor link an identity
  // provider, which login V1 allows. Registering a passkey accepts such a
  // session as well (registerPasskeyLink).
  const isUserVerified =
    (await checkUserVerification(sessionWithData.factors.user?.id)) ||
    (!!sessionWithData.session && (await isSessionValid({ serviceConfig, session: sessionWithData.session })));

  if (!isUserVerified) {
    const params = new URLSearchParams({
      loginName: sessionWithData.factors.user.loginName as string,
      invite: "true",
      send: "true", // set this to true to request a new code immediately
    });

    if (requestId) {
      params.append("requestId", requestId);
    }

    if (organization || sessionWithData.factors.user.organizationId) {
      params.append("organization", organization ?? (sessionWithData.factors.user.organizationId as string));
    }

    redirect(`/verify?` + params);
  }

  const { identityProviders } = await getActiveIdentityProviders({
    serviceConfig,
    orgId: sessionWithData.factors?.user?.organizationId,
    linking_allowed: true,
  });

  // An account with a password, a passkey or an identity provider can sign in
  // already. For it the page only links identity providers, and it names the
  // providers the account is linked with instead of offering them again. An
  // account with a second factor alone chooses a password or a passkey, as
  // one without any authenticator does.
  const primaryMethods = primaryMethodsOf(sessionWithData.authMethods);
  const hasAuthenticator = primaryMethods.length > 0;
  const linkableIdps = loginSettings?.allowExternalIdp ? identityProviders : [];

  let linkedIdpIds: string[] = [];
  if (hasAuthenticator && linkableIdps.length) {
    try {
      const { result } = await listIDPLinks({ serviceConfig, userId: sessionWithData.factors.user.id });
      linkedIdpIds = result.map((link) => link.idpId);
    } catch (error) {
      // Without the links every provider stays on offer, as upstream has it.
      logger.warn("Could not list the identity provider links of the user", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const params = new URLSearchParams({
    initial: "true", // defines that a code is not required and is therefore not shown in the UI
  });

  if (sessionWithData.factors?.user?.loginName) {
    params.set("loginName", sessionWithData.factors?.user?.loginName);
  }

  if (sessionWithData.factors?.user?.organizationId) {
    params.set("organization", sessionWithData.factors?.user?.organizationId);
  }

  if (requestId) {
    params.set("requestId", requestId);
  }

  return (
    <DynamicTheme branding={branding}>
      <div className="flex flex-col space-y-4">
        {/* An account that can sign in already has no method to choose. Its
            heading names what the page shows it, its sign-in methods, and the
            sentence below says that the account is set up. */}
        <h1>
          <Translated i18nKey={hasAuthenticator ? "linkTitle" : "title"} namespace="authenticator" />
        </h1>

        <p className="ztdl-p">
          <Translated i18nKey={hasAuthenticator ? "accountReady" : "description"} namespace="authenticator" />
        </p>

        <UserAvatar
          loginName={sessionWithData.factors?.user?.loginName}
          displayName={sessionWithData.factors?.user?.displayName}
          showDropdown
          searchParams={searchParams}
        ></UserAvatar>
      </div>

      <div className="w-full">
        {hasAuthenticator && (
          <LinkIdentityProviders
            identityProviders={linkableIdps}
            linkedIdpIds={linkedIdpIds}
            requestId={requestId}
            organization={sessionWithData.factors?.user?.organizationId}
            sessionId={sessionWithData.id}
          />
        )}

        {loginSettings && !hasAuthenticator && (
          <ChooseAuthenticatorToSetup
            authMethods={primaryMethods} // its own check would warn an account with a second factor alone
            loginSettings={loginSettings}
            params={params}
            // While people register with a passkey, an account without a way
            // to sign in gets a passkey here, never a password, so a stopped
            // registration cannot end with one (changePassword refuses it too).
            passkeyOnly={allowsPasskeyRegistration(loginSettings)}
          ></ChooseAuthenticatorToSetup>
        )}

        {!hasAuthenticator && loginSettings?.allowExternalIdp && !!identityProviders.length && (
          <>
            <div className="flex flex-col py-3">
              <p className="ztdl-p text-center">
                <Translated i18nKey="linkWithIDP" namespace="authenticator" />
              </p>
            </div>

            <SignInWithIdp
              showLabel={false}
              identityProviders={identityProviders}
              requestId={requestId}
              organization={sessionWithData.factors?.user?.organizationId}
              sessionId={sessionWithData.id} // tell the callback function to link the IDP
            ></SignInWithIdp>
          </>
        )}

        <div className="mt-8 flex w-full flex-row items-center">
          <BackButton />
          <span className="flex-grow"></span>
        </div>
      </div>
    </DynamicTheme>
  );
}
