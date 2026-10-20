import { afterEach, describe, expect, test, vi } from "vitest";
import { getLoginTheme } from "./login-theme";

describe("getLoginTheme", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("keeps upstream's look while LOGIN_THEME is unset", () => {
    vi.stubEnv("LOGIN_THEME", undefined);

    expect(getLoginTheme()).toBeUndefined();
  });

  test("keeps upstream's look for a look it does not know", () => {
    vi.stubEnv("LOGIN_THEME", "material");

    expect(getLoginTheme()).toBeUndefined();
  });

  test("selects the Walther look", () => {
    vi.stubEnv("LOGIN_THEME", "walther");

    expect(getLoginTheme()).toBe("walther");
  });

  test("ignores case and surrounding blanks", () => {
    vi.stubEnv("LOGIN_THEME", " Walther ");

    expect(getLoginTheme()).toBe("walther");
  });

  test("reads the variable on every call, not once at import", () => {
    vi.stubEnv("LOGIN_THEME", "walther");
    expect(getLoginTheme()).toBe("walther");

    vi.stubEnv("LOGIN_THEME", "");
    expect(getLoginTheme()).toBeUndefined();
  });
});
