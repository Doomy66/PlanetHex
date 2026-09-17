/**
 * What version this is, and where to say something about it.
 *
 * The version is written in by the build from package.json, which is the one
 * number that reaches a user: the Windows installer names itself after it.
 */

declare const __APP_VERSION__: string;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

/** Where the project lives, which is where everything below points. */
export const REPOSITORY = "https://github.com/Doomy66/PlanetHex";

export const RELEASE_NOTES = `${REPOSITORY}/blob/main/CHANGELOG.md`;

/**
 * A new issue, with what was on screen already filled in. AppSpec 2.6.
 *
 * A link rather than a form in the application. A form would need somewhere to
 * send to, a way to keep spam out of it, and a promise that somebody is reading
 * it; a link costs none of that, and the person who reported the thing keeps
 * their own issue and can see what happens to it.
 *
 * What is filled in is the version and whatever level and seed was open, because
 * a report that says which seed it was is a report that can be reproduced, and
 * nobody remembers to include it.
 */
export function suggestionLink(about: { level?: string; seed?: string } = {}): string {
  const lines = [
    "",
    "",
    "---",
    `PlanetHex ${APP_VERSION}`,
    about.level === undefined ? "" : `Level: ${about.level}`,
    about.seed === undefined || about.seed === "" ? "" : `Seed: ${about.seed}`,
  ].filter((line, at) => line !== "" || at < 3);
  const body = encodeURIComponent(lines.join("\n"));
  return `${REPOSITORY}/issues/new?body=${body}`;
}
