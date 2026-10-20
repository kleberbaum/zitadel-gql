// @vitest-environment node
import { describe, expect, test } from "vitest";
import de from "../../locales/de.json";
import en from "../../locales/en.json";

type Messages = { [key: string]: string | Messages };

/** Every message of a tree, as its dotted key and its text. */
function messages(tree: Messages, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [[`${prefix}${key}`, value] as [string, string]] : messages(value, `${prefix}${key}.`),
  );
}

describe("the German messages", () => {
  test("address the user formally, with Sie", () => {
    const informal = messages(de).filter(([, text]) => /\b(du|dich|dir|dein\w*)\b/i.test(text));

    expect(informal).toEqual([]);
    expect(de.idp.completeRegister.description).toBe(
      "Bitte vervollständigen Sie die Registrierung, um Ihr Konto zu erstellen.",
    );
    expect(de.authenticator.linkWithIDP).toBe("oder verknüpfen Sie Ihr Konto mit einem Identitätsanbieter");
  });
});

describe("the registration with a passkey (P5)", () => {
  test("is labelled in German and in English", () => {
    expect(de.register.passkey.title).toBe("Mit Passkey registrieren");
    expect(en.register.passkey.title).toBe("Register with a passkey");
  });

  test("says in one line which devices a passkey is and that it replaces the password", () => {
    const lines: [string, string, string][] = [
      [de.register.passkey.description, "einem Sicherheitsschlüssel", "Passwort"],
      [en.register.passkey.description, "a security key", "password"],
    ];

    for (const [line, securityKey, password] of lines) {
      for (const device of ["Face ID", "Touch ID", "Windows Hello", securityKey, password]) {
        expect(line).toContain(device);
      }
      expect(line).not.toMatch(/[\u2013\u2014;!]/);
    }
  });
});
