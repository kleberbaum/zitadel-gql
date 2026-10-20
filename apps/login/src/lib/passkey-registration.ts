import { LoginSettings, PasskeysType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";

/**
 * Registration with a passkey while self-registration is closed, chosen per
 * deployment with PASSKEY_REGISTRATION.
 *
 * Set to "true", an organization whose login policy allows passkeys but not
 * self-registration lets a person register with a passkey, beside the
 * identity providers that allow creation. The passkey is the account's only
 * way to sign in, a password stays refused. The variable is read on the
 * server at request time, like LOGIN_THEME, so one image serves deployments
 * with and without it.
 *
 * Such an account is as safe to sign in to as one of an identity provider
 * only with its email address confirmed, so the registration also needs
 * EMAIL_VERIFICATION set to "true". Without it no code would be asked for,
 * and the registration stays closed.
 */
export function isPasskeyRegistrationEnabled(): boolean {
  return process.env.PASSKEY_REGISTRATION === "true" && process.env.EMAIL_VERIFICATION === "true";
}

/**
 * Whether PASSKEY_REGISTRATION lets a person register with a passkey in the
 * organization of these login settings: its self-registration is closed and
 * its login policy allows passkeys. With self-registration open, upstream's
 * registration applies and this answers false.
 */
export function allowsPasskeyRegistration(loginSettings: LoginSettings | undefined): boolean {
  return (
    !!loginSettings &&
    !loginSettings.allowRegister &&
    loginSettings.passkeysType === PasskeysType.ALLOWED &&
    isPasskeyRegistrationEnabled()
  );
}
