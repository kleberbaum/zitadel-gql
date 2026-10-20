import { LoginSettings, PasskeysType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
import { Alert, AlertType } from "./alert";
import { PASSKEYS, PASSWORD } from "./auth-methods";
import { Translated } from "./translated";

type Props = {
  authMethods: AuthenticationMethodType[];
  params: URLSearchParams;
  loginSettings: LoginSettings;
  /**
   * Offer a passkey and never a password, as the registration with a passkey
   * (PASSKEY_REGISTRATION) does. An account that stopped that registration
   * before its passkey was set up finishes it here.
   */
  passkeyOnly?: boolean;
};

export function ChooseAuthenticatorToSetup({ authMethods, params, loginSettings, passkeyOnly = false }: Props) {
  if (authMethods.length !== 0) {
    return (
      <Alert type={AlertType.ALERT}>
        <Translated i18nKey="allSetup" namespace="authenticator" />
      </Alert>
    );
  } else {
    return (
      <div className="grid w-full grid-cols-1 gap-5 pt-4">
        {!authMethods.includes(AuthenticationMethodType.PASSWORD) &&
          loginSettings.allowLocalAuthentication &&
          !passkeyOnly &&
          PASSWORD(false, "/password/set?" + params)}
        {!authMethods.includes(AuthenticationMethodType.PASSKEY) &&
          loginSettings.passkeysType == PasskeysType.ALLOWED &&
          PASSKEYS(false, "/passkey/set?" + params)}
      </div>
    );
  }
}
