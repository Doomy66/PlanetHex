import { describeUwp, uwpBreakdown } from "../../gen/describe";
import { formatPbg, pbgFor, tradeCodes } from "../../gen/trade";
import { formatLattice } from "../../grid/coord";
import { formatSectorHex, parseSectorHex, subsectorLetter } from "../../location";
import { isRetrograde, isTidallyLocked } from "../../gen/climate";
import type { PlanetDetail } from "../../gen/detail";
import type { Planet } from "../../planet";
import type { Poi } from "../../poi";

/**
 * The world sheet: one page about the planet, in Markdown and in HTML. Spec 6.19.
 *
 * Everything else a save writes is the ground. This is the world as a referee
 * reads it out at the table: the profile with each digit spelled out, the figures
 * worked out from it, the prose the panel shows, whatever the user has written,
 * and every point of interest by name and by hex.
 *
 * Two files rather than one because they are wanted in different places. The
 * Markdown goes into a campaign wiki, a notes app, or a repository, where it will
 * be read as text and styled by whatever holds it. The HTML is for printing and
 * for handing to a player: it carries its own styling, because a page that has to
 * be paired with a stylesheet is a page that will be opened without one.
 *
 * Both are built from one description below, so the two cannot drift apart.
 */

interface Section {
  readonly heading: string;
  readonly body: Block[];
}

type Block =
  | { readonly kind: "prose"; readonly text: string }
  | { readonly kind: "rows"; readonly rows: readonly (readonly [string, string])[] }
  | { readonly kind: "entries"; readonly entries: readonly Entry[] };

interface Entry {
  readonly title: string;
  readonly note: string;
  readonly body: string;
}

export interface SheetInput {
  readonly planet: Planet;
  readonly detail: PlanetDetail;
  /** Rows per face of the level the map was exported at, for the record. */
  readonly size: number;
  readonly cells: number;
}

function build(input: SheetInput): { title: string; subtitle: string; sections: Section[] } {
  const { planet, detail } = input;
  const title = planet.name.trim() || "Unnamed";
  const positions = uwpBreakdown(planet.uwp, detail);
  const codes = tradeCodes(planet.uwp);
  const description = describeUwp(planet.uwp, detail);
  const sections: Section[] = [];

  sections.push({
    heading: "Profile",
    body: [
      {
        kind: "rows",
        rows: [
          ["UWP", planet.uwp.trim() || "unrecorded"],
          ["Sector", planet.sector.trim() || "unrecorded"],
          ["Hex", location(planet)],
          [
            "Trade codes",
            codes.length === 0 ? "none" : codes.map((c) => `${c.code} (${c.label})`).join(", "),
          ],
          ["PBG", formatPbg(pbgFor(planet.seed, planet.uwp))],
          ["Seed", planet.seed],
        ],
      },
      ...(description === null ? [] : [{ kind: "prose" as const, text: description }]),
    ],
  });

  if (positions !== null) {
    sections.push({
      heading: "The profile, position by position",
      body: [
        {
          kind: "rows",
          rows: positions.map((p) => [`${p.label} ${p.digit}`, p.meaning] as const),
        },
      ],
    });
  }

  sections.push({
    heading: "The world",
    body: [
      {
        kind: "rows",
        rows: [
          ...detail.rows.map((row) => [row.label, row.exact ?? row.text] as const),
          ["Axial tilt", `${detail.axialTiltDeg.toFixed(1)}°${
            isRetrograde(detail.axialTiltDeg) ? ", turning backwards" : ""
          }`],
          ["Orbit", `${detail.orbitAu.toFixed(2)} AU`],
          ["Mean temperature", `${(detail.meanTempK - 273.15).toFixed(0)}°C`],
          [
            "Day",
            isTidallyLocked(detail.rotationHours, detail.orbitAu)
              ? "one face always to its sun"
              : `${detail.rotationHours.toFixed(1)} hours`,
          ],
          ["Map detail", `${input.cells.toLocaleString("en-GB")} hexes, ${input.size} rows per face`],
        ],
      },
    ],
  });

  const narrative = planet.narrative.trim();
  if (narrative !== "") {
    sections.push({ heading: "Narrative", body: [{ kind: "prose", text: narrative }] });
  }

  if (planet.pois.length > 0) {
    sections.push({
      heading: "Points of interest",
      body: [
        {
          kind: "entries",
          entries: [...planet.pois]
            // Places first, then the notes about them, and alphabetical within
            // each, so a sheet of a dozen can be read down rather than searched.
            .sort(
              (a, b) =>
                kindRank(a) - kindRank(b) || a.name.localeCompare(b.name, "en-GB"),
            )
            .map((poi) => ({
              title: poi.name.trim() || "Unnamed",
              note: `${poi.kind === "starport" ? "Starport" : "Comment"} · ${formatLattice(poi.ref)}`,
              body: poi.narrative.trim(),
            })),
        },
      ],
    });
  }

  return {
    title,
    subtitle: [planet.uwp.trim(), planet.sector.trim(), location(planet)]
      .filter((part) => part !== "" && part !== "unrecorded")
      .join(" · "),
    sections,
  };
}

const kindRank = (poi: Poi): number => (poi.kind === "starport" ? 0 : 1);

/** The hex, with the subsector it falls in where the digits are a real square. */
function location(planet: Planet): string {
  const hex = parseSectorHex(planet.hex);
  if (hex === null) return planet.hex.trim() || "unrecorded";
  return `${formatSectorHex(hex)}, subsector ${subsectorLetter(hex)}`;
}

/* Markdown ---------------------------------------------------------------- */

export function worldSheetMarkdown(input: SheetInput): string {
  const { title, subtitle, sections } = build(input);
  const out: string[] = [`# ${title}`, ""];
  if (subtitle !== "") out.push(`*${subtitle}*`, "");
  for (const section of sections) {
    out.push(`## ${section.heading}`, "");
    for (const block of section.body) {
      if (block.kind === "prose") {
        out.push(...block.text.split(/\n{2,}/).flatMap((p) => [p.trim(), ""]));
      } else if (block.kind === "rows") {
        out.push("| | |", "| --- | --- |");
        for (const [label, value] of block.rows) {
          out.push(`| ${cell(label)} | ${cell(value)} |`);
        }
        out.push("");
      } else {
        for (const entry of block.entries) {
          out.push(`### ${entry.title}`, "", `*${entry.note}*`, "");
          if (entry.body !== "") out.push(entry.body, "");
        }
      }
    }
  }
  out.push("---", "", "Generated by PlanetHex.", "");
  return out.join("\n");
}

/** A table cell. A pipe in free text would otherwise start a new column. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/* HTML -------------------------------------------------------------------- */

/**
 * The page's own styling. Light rather than the panel's dark, because this one is
 * meant to be printed and a dark page prints as a black page. Sized in points for
 * the same reason.
 */
const SHEET_STYLE = `
  :root { color-scheme: light; }
  body {
    margin: 0 auto;
    padding: 2.5em 2em 3em;
    max-width: 46em;
    background: #fff;
    color: #14161a;
    font: 11pt/1.5 "Iowan Old Style", Palatino, Georgia, serif;
  }
  h1 { margin: 0; font-size: 2em; letter-spacing: -0.01em; }
  .subtitle { margin: 0.2em 0 2em; color: #5a6270; font-style: italic; }
  h2 {
    margin: 2em 0 0.6em;
    font-size: 1.05em;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #5a6270;
    border-bottom: 1px solid #d8dce3;
    padding-bottom: 0.3em;
  }
  h3 { margin: 1.4em 0 0.1em; font-size: 1.1em; }
  table { border-collapse: collapse; width: 100%; margin: 0.4em 0 1em; }
  th, td { text-align: left; vertical-align: top; padding: 0.28em 0.8em 0.28em 0; }
  th { width: 12em; font-weight: 600; color: #3b424e; }
  tr + tr th, tr + tr td { border-top: 1px solid #edeff3; }
  p { margin: 0 0 0.9em; }
  .note { margin: 0 0 0.4em; color: #5a6270; font-size: 0.9em; font-style: italic; }
  footer { margin-top: 3em; color: #8a93a1; font-size: 0.85em; }
  @media print { body { padding: 0; max-width: none; } h2 { break-after: avoid; } }
`;

export function worldSheetHtml(input: SheetInput): string {
  const { title, subtitle, sections } = build(input);
  const out: string[] = [
    "<!doctype html>",
    `<html lang="en"><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${esc(title)}</title>`,
    `<style>${SHEET_STYLE}</style>`,
    `</head><body>`,
    `<h1>${esc(title)}</h1>`,
  ];
  if (subtitle !== "") out.push(`<p class="subtitle">${esc(subtitle)}</p>`);
  for (const section of sections) {
    out.push(`<h2>${esc(section.heading)}</h2>`);
    for (const block of section.body) {
      if (block.kind === "prose") {
        out.push(...paragraphs(block.text));
      } else if (block.kind === "rows") {
        out.push("<table><tbody>");
        for (const [label, value] of block.rows) {
          out.push(`<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`);
        }
        out.push("</tbody></table>");
      } else {
        for (const entry of block.entries) {
          out.push(`<h3>${esc(entry.title)}</h3>`, `<p class="note">${esc(entry.note)}</p>`);
          if (entry.body !== "") out.push(...paragraphs(entry.body));
        }
      }
    }
  }
  out.push("<footer>Generated by PlanetHex.</footer>", "</body></html>", "");
  return out.join("\n");
}

/** Free prose as paragraphs, split where the user left a blank line. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => `<p>${esc(part).replace(/\n/g, "<br>")}</p>`);
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
