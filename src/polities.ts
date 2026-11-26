/**
 * The table of who holds what, and what to call them. AppSpec 9.
 *
 * An allegiance code on a world is four letters and nothing else: `ImDd` only
 * means the Domain of Deneb because a table somewhere says so. An imported
 * sector arrives with that table and a rolled one has never had it, which left
 * a referee marking out their own space with codes that stood for nothing and
 * read back as codes.
 *
 * So the table is a thing a sector owns, imported or not, and is kept in the
 * same place either way - the charted map the import already fills in. It
 * travels with the document and needs no network to read back.
 *
 * Pure, so the dialog that edits it can be tested without one.
 */

import type { AllegianceName, ChartedMap } from "./charted-map";
import { chartedIsEmpty, NOTHING_CHARTED } from "./charted-map";

/** A row as the dialog collects it, before anything has been checked. */
export interface PolityRow {
  readonly code: string;
  readonly name: string;
  readonly short: string;
  /** Whether to draw a frontier round the hexes it holds. AppSpec 9.5.2. */
  readonly border: boolean;
}

/** The longest an allegiance code can be: T5 writes four, and older data two. */
export const CODE_LIMIT = 4;

/** What a document knows, which may be nothing at all. */
export function allegiancesIn(charted: ChartedMap | undefined): readonly AllegianceName[] {
  return charted?.allegiances ?? [];
}

/**
 * The same charted map wearing a different allegiance table.
 *
 * Undefined where that leaves nothing worth carrying, so a sector whose table
 * is emptied goes back to having no charted map rather than an empty one: a
 * document should say only what somebody put in it.
 */
export function withAllegiances(
  charted: ChartedMap | undefined,
  allegiances: readonly AllegianceName[],
): ChartedMap | undefined {
  const next: ChartedMap = { ...(charted ?? NOTHING_CHARTED), allegiances };
  return chartedIsEmpty(next) ? undefined : next;
}

/** What the dialog could not keep, so it can say so rather than quietly dropping it. */
export interface TidyReport {
  readonly kept: AllegianceName[];
  /** Codes given more than once. Only the first of each was kept. */
  readonly repeated: string[];
  /** How many rows had a name but no code, and so could not be kept. */
  readonly uncoded: number;
}

/**
 * Tidy what the dialog collected into a table worth saving.
 *
 * Trimmed, emptied rows dropped, repeats dropped, and sorted by code so the
 * saved file does not change because somebody added a row in the middle. The
 * case is left as typed: the published codes are mixed case on purpose, and
 * `ZhIN` shouted back as `ZHIN` would be this application correcting the
 * setting's spelling.
 */
export function tidyAllegiances(rows: readonly PolityRow[]): TidyReport {
  const kept: AllegianceName[] = [];
  const seen = new Set<string>();
  const repeated: string[] = [];
  let uncoded = 0;

  for (const row of rows) {
    const code = row.code.trim().slice(0, CODE_LIMIT);
    const name = row.name.trim();
    const short = row.short.trim();
    if (code === "") {
      // A wholly blank row is somebody who pressed Add and changed their mind,
      // which is not worth mentioning. A name with no code is a row they meant.
      if (name !== "" || short !== "") uncoded += 1;
      continue;
    }
    // Compared without case, because two rows differing only in case are a
    // typo rather than two polities, and the map would draw them as two.
    const key = code.toLowerCase();
    if (seen.has(key)) {
      if (!repeated.includes(code)) repeated.push(code);
      continue;
    }
    seen.add(key);
    kept.push({ code, name, short, ...(row.border ? { border: true } : {}) });
  }

  kept.sort((a, b) => a.code.localeCompare(b.code));
  return { kept, repeated, uncoded };
}

/**
 * The codes a document's worlds actually use that the table does not name.
 *
 * What makes the dialog worth opening: a referee who has marked a run of hexes
 * `ZhIN` wants the rows for them offered rather than typed again, and a code
 * used on a world and named nowhere is the gap this whole table exists to fill.
 */
export function unnamedCodes(
  used: readonly string[],
  allegiances: readonly AllegianceName[],
): string[] {
  const named = new Set(allegiances.map((one) => one.code.toLowerCase()));
  const out: string[] = [];
  for (const code of used) {
    const wanted = code.trim();
    if (wanted === "") continue;
    const key = wanted.toLowerCase();
    if (named.has(key) || out.some((one) => one.toLowerCase() === key)) continue;
    out.push(wanted);
  }
  return out.sort((a, b) => a.localeCompare(b));
}
