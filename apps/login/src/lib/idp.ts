import { IDPType } from "@zitadel/proto/zitadel/idp/v2/idp_pb";
import { IdentityProviderType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { SetHumanProfile } from "@zitadel/proto/zitadel/user/v2/user_pb";
import { RetrieveIdentityProviderIntentResponse } from "@zitadel/proto/zitadel/user/v2/user_service_pb";

// This maps the IdentityProviderType to a slug which is used in the /success and /failure routes
export function idpTypeToSlug(idpType: IdentityProviderType) {
  switch (idpType) {
    case IdentityProviderType.GITHUB:
      return "github";
    case IdentityProviderType.GITHUB_ES:
      return "github_es";
    case IdentityProviderType.GITLAB:
      return "gitlab";
    case IdentityProviderType.GITLAB_SELF_HOSTED:
      return "gitlab_es";
    case IdentityProviderType.APPLE:
      return "apple";
    case IdentityProviderType.GOOGLE:
      return "google";
    case IdentityProviderType.AZURE_AD:
      return "azure";
    case IdentityProviderType.SAML:
      return "saml";
    case IdentityProviderType.OAUTH:
      return "oauth";
    case IdentityProviderType.OIDC:
      return "oidc";
    case IdentityProviderType.LDAP:
      return "ldap";
    case IdentityProviderType.JWT:
      return "jwt";
    default:
      throw new Error("Unknown identity provider type");
  }
}

// TODO: this is ugly but needed atm as the getIDPByID returns a IDPType and not a IdentityProviderType
export function idpTypeToIdentityProviderType(idpType: IDPType): IdentityProviderType {
  switch (idpType) {
    case IDPType.IDP_TYPE_GITHUB:
      return IdentityProviderType.GITHUB;

    case IDPType.IDP_TYPE_GITHUB_ES:
      return IdentityProviderType.GITHUB_ES;

    case IDPType.IDP_TYPE_GITLAB:
      return IdentityProviderType.GITLAB;

    case IDPType.IDP_TYPE_GITLAB_SELF_HOSTED:
      return IdentityProviderType.GITLAB_SELF_HOSTED;

    case IDPType.IDP_TYPE_APPLE:
      return IdentityProviderType.APPLE;

    case IDPType.IDP_TYPE_GOOGLE:
      return IdentityProviderType.GOOGLE;

    case IDPType.IDP_TYPE_AZURE_AD:
      return IdentityProviderType.AZURE_AD;

    case IDPType.IDP_TYPE_SAML:
      return IdentityProviderType.SAML;

    case IDPType.IDP_TYPE_OAUTH:
      return IdentityProviderType.OAUTH;

    case IDPType.IDP_TYPE_OIDC:
      return IdentityProviderType.OIDC;

    case IDPType.IDP_TYPE_JWT:
      return IdentityProviderType.JWT;

    default:
      throw new Error("Unknown identity provider type");
  }
}

/**
 * The given and family name an identity provider sent for a person without
 * an account yet, read from an IDP intent. Reads the `user_action.create_user`
 * oneof and, for older API versions, the deprecated `add_human_user` field, in
 * the order of resolveCreateUser in server/idp-intent.ts. A name the provider
 * did not send, or sent blank, is undefined.
 */
export function idpIntentNames(intent: RetrieveIdentityProviderIntentResponse): {
  givenName?: string;
  familyName?: string;
} {
  let profile: SetHumanProfile | undefined;
  if (intent.userAction?.case === "createUser") {
    const userType = intent.userAction.value.userType;
    profile = userType?.case === "human" ? userType.value.profile : undefined;
  } else {
    profile = intent.addHumanUser?.profile;
  }

  return {
    givenName: profile?.givenName?.trim() ? profile.givenName : undefined,
    familyName: profile?.familyName?.trim() ? profile.familyName : undefined,
  };
}
