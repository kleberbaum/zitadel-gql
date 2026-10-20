import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { IdentityProvider } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { SignInWithIdp } from "./sign-in-with-idp";
import { Translated } from "./translated";

type Props = {
  /** The providers the organization lets an existing account link. */
  identityProviders: IdentityProvider[];
  /** The ids of the providers the account is linked with already. */
  linkedIdpIds: string[];
  requestId?: string;
  organization?: string;
  sessionId?: string;
};

/**
 * /authenticator/set for an account that has an authenticator already.
 *
 * Upstream shows a warning there, "You have already setup an authenticator",
 * and a bare provider button below it, which reads like an error and hides
 * the one thing the page is good for on such an account: linking an identity
 * provider. The page heads it "Anmeldemethoden" and says in a neutral
 * sentence that the account can sign in. Below that, this names each
 * provider the account is linked with instead of offering it again, and
 * offers the others under a heading that says what the button does, "Konto
 * mit ID Austria verknüpfen" for a single provider.
 */
export function LinkIdentityProviders({ identityProviders, linkedIdpIds, requestId, organization, sessionId }: Props) {
  const linked = identityProviders.filter((idp) => linkedIdpIds.includes(idp.id));
  const unlinked = identityProviders.filter((idp) => !linkedIdpIds.includes(idp.id));
  const single = unlinked.length === 1 ? unlinked[0] : undefined;

  return (
    <div className="flex w-full flex-col space-y-6">
      {linked.map((idp) => (
        <p
          key={idp.id}
          className="flex flex-row items-center justify-center gap-2 text-sm"
          data-testid={`idp-linked-${idp.id}`}
        >
          <CheckCircleIcon className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
          <Translated i18nKey="alreadyLinked" namespace="authenticator" data={{ provider: idp.name }} />
        </p>
      ))}

      {unlinked.length > 0 && (
        <section aria-labelledby="link-idp-title" className="flex flex-col space-y-3" data-testid="link-idp">
          <h2 id="link-idp-title" className="text-center text-lg font-semibold">
            {single ? (
              <Translated i18nKey="linkIdpTitle" namespace="authenticator" data={{ provider: single.name }} />
            ) : (
              <Translated i18nKey="linkIdpTitleMultiple" namespace="authenticator" />
            )}
          </h2>
          <p className="ztdl-p text-center">
            {single ? (
              <Translated i18nKey="linkIdpDescription" namespace="authenticator" data={{ provider: single.name }} />
            ) : (
              <Translated i18nKey="linkIdpDescriptionMultiple" namespace="authenticator" />
            )}
          </p>
          <SignInWithIdp
            showLabel={false}
            identityProviders={unlinked}
            requestId={requestId}
            organization={organization}
            sessionId={sessionId} // tells the callback to link the provider to this account
          />
        </section>
      )}
    </div>
  );
}
