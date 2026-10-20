import { resolveRedirectUri } from "@/lib/client";
import { getMostRecentCookieWithLoginname } from "@/lib/cookies";
import { completeDeviceAuthorization } from "@/lib/server/device";
import { loadMostRecentSession } from "@/lib/session";
import { getBrandingSettings } from "@/lib/zitadel";
import { cleanup, render } from "@testing-library/react";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import Page from "./page";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => (key: string) => key),
}));

vi.mock("@/lib/service-url", () => ({
  getServiceConfig: vi.fn(() => ({ serviceConfig: { baseUrl: "https://zitadel.test" } })),
}));

vi.mock("@/lib/cookies", () => ({
  getMostRecentCookieWithLoginname: vi.fn(),
  getSessionCookieById: vi.fn(),
}));

vi.mock("@/lib/server/device", () => ({
  completeDeviceAuthorization: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  loadMostRecentSession: vi.fn(),
}));

vi.mock("@/lib/client", () => ({
  resolveRedirectUri: vi.fn(),
}));

vi.mock("@/lib/zitadel", () => ({
  getBrandingSettings: vi.fn(),
  getLoginSettings: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/components/dynamic-theme", () => ({
  DynamicTheme: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/translated", () => ({
  Translated: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

vi.mock("@/components/user-avatar", () => ({
  UserAvatar: () => <div data-testid="user-avatar" />,
}));

const searchParams = { requestId: "device_device-1", loginName: "person@example.com", organization: "org-1" };

describe("signed-in page of a device authorization", () => {
  beforeEach(() => {
    vi.mocked(getBrandingSettings).mockResolvedValue(undefined as any);
    vi.mocked(getMostRecentCookieWithLoginname).mockResolvedValue({
      id: "session-1",
      token: "token-1",
      loginName: "person@example.com",
      organization: "org-1",
    } as any);
    vi.mocked(loadMostRecentSession).mockResolvedValue({
      id: "session-1",
      factors: { user: { loginName: "person@example.com", displayName: "Erika Mustermann" } },
    } as any);
    vi.mocked(resolveRedirectUri).mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("sends a person whose session does not count as signed in to sign in, and shows no approval", async () => {
    vi.mocked(completeDeviceAuthorization).mockResolvedValue({ error: "Session not found or invalid" });

    await expect(Page({ searchParams: Promise.resolve(searchParams) })).rejects.toThrow("NEXT_REDIRECT");

    expect(completeDeviceAuthorization).toHaveBeenCalledWith("device-1", {
      sessionId: "session-1",
      sessionToken: "token-1",
    });
    const url = new URL(vi.mocked(redirect).mock.calls[0][0], "https://login.example.com");
    expect(url.pathname).toBe("/loginname");
    expect(url.searchParams.get("requestId")).toBe("device_device-1");
    expect(url.searchParams.get("loginName")).toBe("person@example.com");
    expect(url.searchParams.get("organization")).toBe("org-1");
  });

  test("shows the page once the session has approved the device", async () => {
    vi.mocked(completeDeviceAuthorization).mockResolvedValue({} as any);

    const { getByText } = render(await Page({ searchParams: Promise.resolve(searchParams) }));

    expect(redirect).not.toHaveBeenCalled();
    expect(getByText(/You can now close this window/)).toBeInTheDocument();
  });
});
