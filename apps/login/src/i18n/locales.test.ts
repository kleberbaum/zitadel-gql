// @vitest-environment node
import { describe, expect, test } from "vitest";
import de from "../../locales/de.json";

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
