import { DynamicTheme } from "@/components/dynamic-theme";
import { RegisterFormIDPIncomplete } from "@/components/register-form-idp-incomplete";
import { Translated } from "@/components/translated";
import { idpIntentNames } from "@/lib/idp";
import { getServiceConfig } from "@/lib/service-url";
import { getBrandingSettings, retrieveIDPIntent } from "@/lib/zitadel";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Complete registration page - shown when manual user registration is required
 */
export default async function CompleteRegistrationPage(props: {
  searchParams: Promise<Record<string | number | symbol, string | undefined>>;
  params: Promise<{ provider: string }>;
}) {
  const searchParams = await props.searchParams;
  const { provider } = await props.params;
  const { id, token, requestId, organization, idpId, idpUserId, email, postErrorRedirectUrl } = searchParams;

  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  const branding = await getBrandingSettings({ serviceConfig, organization });

  if (!id || !token || !idpId || !organization || !idpUserId) {
    throw new Error("Missing required parameters");
  }

  // The names come from the intent itself, not from the query string, and
  // are shown read only where the provider sent them. Reading the intent does
  // not consume it. One that cannot be read (expired, or a wrong token)
  // cannot complete a registration either, so the person is told so here
  // rather than after filling in the form.
  const intent = await retrieveIDPIntent({ serviceConfig, id, token }).catch((error) => {
    console.warn("Could not read the IDP intent of the registration", error);
    return undefined;
  });

  if (!intent) {
    const failureParams = new URLSearchParams({ organization });
    if (requestId) {
      failureParams.set("requestId", requestId);
    }
    if (postErrorRedirectUrl) {
      failureParams.set("postErrorRedirectUrl", postErrorRedirectUrl);
    }
    redirect(`/idp/${provider}/registration-failed?${failureParams}`);
  }

  return (
    <DynamicTheme branding={branding}>
      <div className="flex flex-col space-y-4">
        <h1>
          <Translated i18nKey="completeRegister.title" namespace="idp" />
        </h1>
        <p className="ztdl-p">
          <Translated i18nKey="completeRegister.description" namespace="idp" />
        </p>
      </div>

      <div className="w-full">
        <RegisterFormIDPIncomplete
          idpUserId={idpUserId}
          idpId={idpId}
          idpNames={idpIntentNames(intent)}
          defaultValues={{
            email: email || "",
          }}
          requestId={requestId}
          organization={organization}
          idpIntent={{
            idpIntentId: id,
            idpIntentToken: token,
          }}
        />
      </div>
    </DynamicTheme>
  );
}
