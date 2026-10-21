import { describe, expect, it } from "vitest";
import { isHandheld, restrictToPhoneOrSecurityKey } from "./passkey-devices";

const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

const options = {
  challenge: new ArrayBuffer(8),
  rp: { name: "ZITADEL", id: "accounts.example" },
  user: { id: new ArrayBuffer(8), name: "a@example.org", displayName: "A" },
  pubKeyCredParams: [{ type: "public-key", alg: -7 }],
  authenticatorSelection: { userVerification: "required", residentKey: "required" },
} as PublicKeyCredentialCreationOptions;

describe("isHandheld", () => {
  it("tells phones and tablets from computers", () => {
    expect(isHandheld({ userAgent: WINDOWS_CHROME })).toBe(false);
    expect(isHandheld({ userAgent: MAC_SAFARI, maxTouchPoints: 0 })).toBe(false);
    expect(isHandheld({ userAgent: IPHONE })).toBe(true);
    expect(isHandheld({ userAgent: MAC_SAFARI, maxTouchPoints: 5 })).toBe(true);
    expect(isHandheld({ userAgent: WINDOWS_CHROME, userAgentData: { mobile: true } })).toBe(true);
  });
});

describe("restrictToPhoneOrSecurityKey", () => {
  it("asks a computer for a phone or a security key and keeps the other settings", () => {
    const restricted = restrictToPhoneOrSecurityKey(options, { userAgent: WINDOWS_CHROME }) as any;
    expect(restricted.authenticatorSelection).toEqual({
      userVerification: "required",
      residentKey: "required",
      authenticatorAttachment: "cross-platform",
    });
    expect(restricted.hints).toEqual(["hybrid", "security-key"]);
    expect(restricted.challenge).toBe(options.challenge);
  });

  it("leaves a phone free to keep the passkey itself", () => {
    expect(restrictToPhoneOrSecurityKey(options, { userAgent: IPHONE })).toBe(options);
  });
});
