"use server";

import { authorizeOrDenyDeviceAuthorization, getSession } from "@/lib/zitadel";
import { headers } from "next/headers";
import { getServiceConfig } from "../service-url";
import { isSessionValid } from "../session";

export async function completeDeviceAuthorization(
  deviceAuthorizationId: string,
  session?: { sessionId: string; sessionToken: string },
) {
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  // Zitadel approves the request with any active session and its token and
  // checks none of its factors (ApproveDeviceAuthWithSession). A session that
  // only names the user, as typing a login name or a registration with a
  // passkey leaves one, would approve it too. So only a session that
  // isSessionValid accepts approves, also when a browser calls this action
  // itself. Any other one gets an error and approves nothing.
  if (session) {
    const signedIn = await getSession({ serviceConfig, sessionId: session.sessionId, sessionToken: session.sessionToken })
      .then(({ session: current }) => !!current && isSessionValid({ serviceConfig, session: current }))
      .catch(() => false);

    if (!signedIn) {
      return { error: "Session not found or invalid" };
    }
  }

  // without the session, device auth request is denied
  return authorizeOrDenyDeviceAuthorization({ serviceConfig, deviceAuthorizationId, session });
}
