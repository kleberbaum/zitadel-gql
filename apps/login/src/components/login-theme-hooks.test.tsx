import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { Button, ButtonColors, ButtonVariants } from "./button";
import { Card } from "./card";
import { BaseButton } from "./idps/base-button";
import { TextInput } from "./input";

// The classes src/styles/walther.scss styles. They do nothing in upstream's
// look, but a look selected with LOGIN_THEME needs them on every card,
// button, input and identity provider button.
describe("hooks for a look selected with LOGIN_THEME", () => {
  afterEach(cleanup);

  test("a card", () => {
    render(<Card data-testid="card">Inhalt</Card>);

    expect(screen.getByTestId("card")).toHaveClass("ztdl-card");
  });

  test("a primary and a secondary button", () => {
    render(
      <>
        <Button variant={ButtonVariants.Primary}>Weiter</Button>
        <Button variant={ButtonVariants.Secondary}>Zurück</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Weiter" })).toHaveClass("ztdl-button", "ztdl-button-primary");
    expect(screen.getByRole("button", { name: "Weiter" })).not.toHaveClass("ztdl-button-secondary");
    expect(screen.getByRole("button", { name: "Zurück" })).toHaveClass("ztdl-button", "ztdl-button-secondary");
  });

  test("a warning button keeps its warning colours", () => {
    render(
      <>
        <Button variant={ButtonVariants.Primary} color={ButtonColors.Warn}>
          Löschen
        </Button>
        <Button variant={ButtonVariants.Secondary} color={ButtonColors.Warn}>
          Entfernen
        </Button>
      </>,
    );

    for (const name of ["Löschen", "Entfernen"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveClass("ztdl-button");
      expect(button).not.toHaveClass("ztdl-button-primary");
      expect(button).not.toHaveClass("ztdl-button-secondary");
    }
  });

  test("an input, invalid while it shows an error", () => {
    const { rerender } = render(<TextInput label="Loginname" />);

    const input = screen.getByRole("textbox", { name: /Loginname/ });
    expect(input).toHaveClass("ztdl-input");
    expect(input).not.toHaveAttribute("aria-invalid");

    rerender(<TextInput label="Loginname" error="Pflichtfeld" />);
    expect(screen.getByRole("textbox", { name: /Loginname/ })).toHaveAttribute("aria-invalid", "true");
  });

  test("an identity provider button", () => {
    render(<BaseButton>ID Austria</BaseButton>);

    expect(screen.getByRole("button", { name: "ID Austria" })).toHaveClass("ztdl-idp-button");
  });
});
