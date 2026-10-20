/**
 * The look of the login, chosen per deployment with LOGIN_THEME.
 *
 * Unset, or set to a look this build does not know, the login keeps
 * upstream's look. "walther" dresses it like the Walther wiki of the
 * University of Vienna. The variable is read on the server at request time
 * and is not inlined at build time like the NEXT_PUBLIC_THEME_* settings, so
 * one image serves either look. The root layout puts the look on <html> as
 * data-login-theme, and src/styles/walther.scss applies only below it.
 */
export const LOGIN_THEMES = ["walther"] as const;

export type LoginTheme = (typeof LOGIN_THEMES)[number];

export function getLoginTheme(): LoginTheme | undefined {
  const value = process.env.LOGIN_THEME?.trim().toLowerCase();
  return LOGIN_THEMES.find((theme) => theme === value);
}
