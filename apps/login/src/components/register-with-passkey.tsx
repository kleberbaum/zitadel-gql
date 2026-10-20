import { LegalAndSupportSettings } from "@zitadel/proto/zitadel/settings/v2/legal_settings_pb";
import { clsx } from "clsx";
import { RegisterForm } from "./register-form";
import { Translated } from "./translated";

type Props = {
  legal: LegalAndSupportSettings;
  organization: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  requestId?: string;
  /** Whether identity provider buttons stand above, from which a line sets it off. */
  belowProviders: boolean;
};

/**
 * The registration with a passkey of an organization whose self-registration
 * is closed, offered with PASSKEY_REGISTRATION below the buttons of the
 * identity providers that allow creation. It asks for what a registration
 * through ID Austria asks for, the given and family name and an email address
 * that a code confirms later, and offers no password. After it the person
 * sets up the passkey on /passkey/set, the account's only way to sign in.
 */
export function RegisterWithPasskey({ legal, organization, firstname, lastname, email, requestId, belowProviders }: Props) {
  return (
    <section
      aria-labelledby="register-passkey-title"
      className={clsx(
        "flex w-full flex-col space-y-3",
        belowProviders && "border-divider-light dark:border-divider-dark mt-6 border-t pt-6",
      )}
      data-testid="register-passkey"
    >
      <h2 id="register-passkey-title" className="text-lg font-semibold">
        <Translated i18nKey="passkey.title" namespace="register" />
      </h2>
      <p className="ztdl-p">
        <Translated i18nKey="passkey.description" namespace="register" />
      </p>
      <RegisterForm
        passkeyOnly
        idpCount={0}
        legal={legal}
        organization={organization}
        firstname={firstname}
        lastname={lastname}
        email={email}
        requestId={requestId}
      />
    </section>
  );
}
