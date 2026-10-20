import { LanguageSwitcher } from "@/components/language-switcher";
import ThemeSwitch from "@/components/theme-switch";
import { Lang } from "@/lib/i18n";
import { getWaltherLinks } from "@/lib/login-theme";
import { getLocale, getTranslations } from "next-intl/server";
import { ReactNode } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** The University of Vienna lockup as the wiki draws it, per ground. */
export const WALTHER_LOGO = {
  light: `${basePath}/walther/universitaet-wien.svg`,
  dark: `${basePath}/walther/universitaet-wien-dark.svg`,
};

// The university's name in the frame while a page loads, before its language
// is known. The text alternative of the logo, as the wiki gives it.
const UNIVERSITY = "Universität Wien";

/**
 * The page of the Walther look (LOGIN_THEME=walther): the wiki's header with
 * the University of Vienna logo, its arrow backdrop, and its footer with the
 * legal pages. The root layout renders it around every page in place of
 * upstream's centred background, the pages themselves are unchanged.
 */
export async function WaltherFrame({ children, languages }: { children: ReactNode; languages: Lang[] }) {
  const t = await getTranslations("walther");
  const links = getWaltherLinks(await getLocale());

  return (
    <FrameLayout
      logo={
        <a href={links.home} aria-label={t("home")} className="flex shrink-0 rounded-md">
          <HeaderLogo alt={t("university")} />
        </a>
      }
      controls={
        <>
          <LanguageSwitcher languages={languages} />
          <ThemeSwitch />
        </>
      }
      legal={
        <nav aria-label={t("legal")} className="flex flex-col gap-3">
          <p className="font-medium">{t("legal")}</p>
          {[
            [links.imprint, t("imprint")],
            [links.privacy, t("privacy")],
            [links.terms, t("terms")],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-white/70 transition-colors hover:text-white"
            >
              {label}
            </a>
          ))}
        </nav>
      }
      university={t("university")}
    >
      {children}
    </FrameLayout>
  );
}

/**
 * The frame of the Walther look while a page loads, as the fallback of the
 * root layout. The page waits for its messages, so this draws the frame
 * without them: the logo, not yet linked, the room of the language switch,
 * the theme switch, and the footer with the room of its links but none of
 * their text. Header and footer take the room the frame gives them, so only
 * the card area changes when the page arrives.
 */
export function WaltherFrameFallback({ children }: { children: ReactNode }) {
  return (
    <FrameLayout
      logo={
        <span className="flex shrink-0">
          <HeaderLogo alt={UNIVERSITY} />
        </span>
      }
      controls={
        <>
          {/* The size of the language switch (w-32 in language-switcher.tsx). */}
          <div aria-hidden="true" className="h-9 w-32" />
          <ThemeSwitch />
        </>
      }
      legal={
        <div aria-hidden="true" className="invisible flex w-40 flex-col gap-3">
          {["legal", "imprint", "privacy", "terms"].map((line) => (
            <span key={line} className="font-medium">
              {"\u00a0"}
            </span>
          ))}
        </div>
      }
    >
      {children}
    </FrameLayout>
  );
}

function HeaderLogo({ alt }: { alt: string }) {
  return (
    <>
      <img src={WALTHER_LOGO.light} alt={alt} className="h-11 w-auto sm:h-[52px] dark:hidden" />
      <img src={WALTHER_LOGO.dark} alt={alt} className="hidden h-11 w-auto sm:h-[52px] dark:block" />
    </>
  );
}

/** The header, the backdrop and the footer around a page, with their content passed in. */
function FrameLayout({
  children,
  logo,
  controls,
  legal,
  university,
}: {
  children: ReactNode;
  logo: ReactNode;
  controls: ReactNode;
  legal: ReactNode;
  /** The university's name below the footer's rule, left blank while the language is unknown. */
  university?: string;
}) {
  return (
    <div className="bg-background-light-600 dark:bg-background-dark-600 relative isolate flex min-h-screen flex-col">
      <WaltherBackdrop />

      <header className="flex flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
        {logo}
        <div className="ml-auto flex flex-row items-center gap-4">{controls}</div>
      </header>

      <main className="relative mx-auto flex w-full max-w-[1100px] flex-1 flex-col justify-center py-8">{children}</main>

      <footer className="bg-[#0a0a0a] text-white">
        <div className="mx-auto w-full max-w-7xl px-5 py-12 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-10">
            <img src={WALTHER_LOGO.dark} alt={university ?? UNIVERSITY} className="h-[50px] w-auto" />
            {legal}
          </div>
          <p className="mt-8 border-t border-white/20 pt-5 text-white/60">{university ?? "\u00a0"}</p>
        </div>
      </footer>
    </div>
  );
}

// The wiki's backdrop (ArrowPattern in the walther-wiki repository) as it
// sits behind the header of every page, without its pointer animation: a
// grid of the brand arrow and six filled ones, fading out towards the
// bottom left.
const ARROW = "M 30.99 1 L 28 1 L 31 11 L 1 11 L 4 21 L 50.99 21 Z M 52 25 L 5.01 25 L 25.01 45 L 28 45 L 25 35 L 55 35 Z";
const TILE = 56;
const SIZE = 112;
const SCALE = SIZE / TILE;
const Y_OFFSET = -96;
const FILLED = [
  [1, 1],
  [3, 0],
  [4, 3],
  [6, 1],
  [7, 4],
  [5, 6],
];

export function WaltherBackdrop() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 -top-14 -z-10 h-[520px] w-full"
      fill="rgba(149, 156, 177, 0.1)"
      stroke="rgba(149, 156, 177, 0.1)"
      style={{ maskImage: "linear-gradient(to bottom left, white 40%, transparent 50%)" }}
    >
      <defs>
        <pattern
          id="walther-arrows"
          width={SIZE}
          height={SIZE}
          x="50%"
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(0 ${Y_OFFSET})`}
          fill="none"
        >
          <g transform={`scale(${SCALE})`}>
            {[
              [0, 0],
              [TILE / 2, TILE / 2],
              [-TILE / 2, TILE / 2],
              [TILE / 2, -TILE / 2],
              [-TILE / 2, -TILE / 2],
            ].map(([dx, dy]) => (
              <path key={`${dx}:${dy}`} transform={`translate(${dx} ${dy})`} d={ARROW} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#walther-arrows)" strokeWidth="0" />
      <svg x="50%" y={Y_OFFSET} strokeWidth="0" overflow="visible">
        {FILLED.map(([i, j]) => (
          <path
            key={`${i}:${j}`}
            transform={`translate(${(TILE / 2) * (i + j) * SCALE} ${(TILE / 2) * (i - j) * SCALE}) scale(${SCALE})`}
            d={ARROW}
          />
        ))}
      </svg>
    </svg>
  );
}
