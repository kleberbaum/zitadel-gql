"use client";

import { handleServerActionResponse } from "@/lib/client-utils";
import { registerUserAndLinkToIDP } from "@/lib/server/register";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FieldValues, useForm } from "react-hook-form";
import { Alert } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { BackButton } from "./back-button";
import { Button, ButtonVariants } from "./button";
import { TextInput } from "./input";
import { Spinner } from "./spinner";
import { Translated } from "./translated";

type Inputs =
  | {
      firstname: string;
      lastname: string;
      email: string;
    }
  | FieldValues;

type Props = {
  organization: string;
  requestId?: string;
  idpIntent: {
    idpIntentId: string;
    idpIntentToken: string;
  };
  defaultValues?: {
    firstname?: string;
    lastname?: string;
    email?: string;
  };
  /**
   * The names the identity provider sent with the intent. A name given here
   * is shown read only. The server action reads it from the intent again and
   * ignores what the form submits for it.
   */
  idpNames?: {
    givenName?: string;
    familyName?: string;
  };
  idpUserId: string;
  idpId: string;
};

export function RegisterFormIDPIncomplete({
  organization,
  requestId,
  idpIntent,
  defaultValues,
  idpNames,
  idpUserId,
  idpId,
}: Props) {
  const firstnameFromIdp = !!idpNames?.givenName;
  const lastnameFromIdp = !!idpNames?.familyName;

  const { register, handleSubmit, formState } = useForm<Inputs>({
    mode: "onChange",
    defaultValues: {
      email: defaultValues?.email ?? "",
      firstname: idpNames?.givenName ?? defaultValues?.firstname ?? "",
      lastname: idpNames?.familyName ?? defaultValues?.lastname ?? "",
    },
  });

  const t = useTranslations("register");
  const router = useRouter();

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);

  async function submitAndRegister(values: Inputs) {
    setLoading(true);
    try {
      const response = await registerUserAndLinkToIDP({
        idpId: idpId,
        idpUserId: idpUserId,
        email: values.email,
        firstName: values.firstname,
        lastName: values.lastname,
        organization: organization,
        requestId: requestId,
        idpIntent: idpIntent,
      });

      handleServerActionResponse(response, router, setSamlData, setError);
    } catch {
      setError("Could not register user");
    } finally {
      setLoading(false);
    }
  }

  const { errors } = formState;

  return (
    <>
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
      <form className="w-full">
        <div className="mb-4 grid grid-cols-1 gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="">
              <TextInput
                type="firstname"
                autoComplete="firstname"
                autoFocus={!firstnameFromIdp}
                readOnly={firstnameFromIdp}
                required
                {...register("firstname", { required: t("required.firstname") })}
                label={t("labels.firstname")}
                error={errors.firstname?.message as string}
                data-testid="firstname-text-input"
              />
            </div>
            <div className="">
              <TextInput
                type="lastname"
                autoComplete="lastname"
                autoFocus={firstnameFromIdp && !lastnameFromIdp}
                readOnly={lastnameFromIdp}
                required
                {...register("lastname", { required: t("required.lastname") })}
                label={t("labels.lastname")}
                error={errors.lastname?.message as string}
                data-testid="lastname-text-input"
              />
            </div>
          </div>
          <div className="">
            <TextInput
              type="email"
              autoComplete="email"
              autoFocus={firstnameFromIdp && lastnameFromIdp}
              required
              {...register("email", { required: t("required.email") })}
              label={t("labels.email")}
              error={errors.email?.message as string}
              data-testid="email-text-input"
            />
          </div>
        </div>

        {error && (
          <div className="py-4">
            <Alert>{error}</Alert>
          </div>
        )}

        <div className="mt-8 flex w-full flex-row items-center justify-between">
          <BackButton data-testid="back-button" />
          <Button
            type="submit"
            variant={ButtonVariants.Primary}
            disabled={loading || !formState.isValid}
            onClick={handleSubmit(submitAndRegister)}
            data-testid="submit-button"
          >
            {loading && <Spinner className="mr-2 h-5 w-5" />} <Translated i18nKey="submit" namespace="register" />
          </Button>
        </div>
      </form>
    </>
  );
}
