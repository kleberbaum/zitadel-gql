/**
 * Where a new passkey may live. The owner wants passkeys only on a phone or
 * a security key such as a YubiKey. A computer's own store (Windows Hello,
 * a browser profile, the Mac keychain) stays with the machine, which in a
 * university office is often shared or replaced.
 *
 * On a computer the creation therefore asks for a roaming authenticator
 * (`cross-platform`), and the hints make the browser open with the phone's
 * QR code and the security key instead of its own store. On a phone or a
 * tablet the device itself is the phone, so nothing is restricted there.
 */

interface NavigatorLike {
  userAgent: string;
  maxTouchPoints?: number;
  userAgentData?: { mobile?: boolean };
}

/** Whether the browser runs on a phone or a tablet. */
export function isHandheld(nav: NavigatorLike): boolean {
  if (nav.userAgentData?.mobile) return true;
  if (/Android|iPhone|iPad|iPod/i.test(nav.userAgent)) return true;
  // iPadOS presents itself as a Mac, only the touch screen gives it away.
  return /Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1;
}

/**
 * The creation options restricted to a phone or a security key when the
 * browser runs on a computer, unchanged on a phone or a tablet.
 */
export function restrictToPhoneOrSecurityKey(
  publicKey: PublicKeyCredentialCreationOptions,
  nav: NavigatorLike,
): PublicKeyCredentialCreationOptions {
  if (isHandheld(nav)) return publicKey;

  return {
    ...publicKey,
    authenticatorSelection: {
      ...publicKey.authenticatorSelection,
      authenticatorAttachment: "cross-platform",
    },
    // WebAuthn Level 3. Browsers without hints ignore the field.
    hints: ["hybrid", "security-key"],
  } as PublicKeyCredentialCreationOptions;
}
