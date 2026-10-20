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

/** The wiki the Walther look belongs to. Its English pages live below /en. */
export const WALTHER_SITE = "https://walther.exp.univie.ac.at";

export type WaltherLinks = {
  home: string;
  imprint: string;
  privacy: string;
  terms: string;
};

/**
 * The wiki's start page and the three legal pages its footer links, in the
 * language of the login. German is the wiki's default, every other language
 * gets the English pages.
 */
export function getWaltherLinks(locale: string): WaltherLinks {
  const prefix = locale === "de" ? "" : "/en";

  return {
    home: `${WALTHER_SITE}${prefix}/`,
    imprint: `${WALTHER_SITE}${prefix}/imprint/`,
    privacy: `${WALTHER_SITE}${prefix}/privacy-policy/`,
    terms: `${WALTHER_SITE}${prefix}/terms-of-service/`,
  };
}
