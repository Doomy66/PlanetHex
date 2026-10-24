/**
 * Reading a published sector off The Traveller Map. AppSpec 8.
 *
 * Two halves, kept apart on purpose. The parser below is a pure function from
 * text to rows and is where every decision about the format lives; the fetching
 * at the foot takes the fetch to use as an argument, so the half that can be
 * wrong is testable without a network and the half that needs a network has
 * almost nothing in it.
 *
 * Nothing here is stored. The data is Mongoose Publishing's, published on
 * travellermap.com under their Fair Use Policy for personal, non-commercial
 * use, and it is not ours to ship: no sector file is held in this repository
 * or in a build, and what a user fetches goes to their machine and stops
 * there. The application is still a generator that ships no setting material,
 * which is what the README has always said.
 *
 * The columns are the T5 Second Survey's, documented at
 * travellermap.com/doc/secondsurvey, and they are read by name rather than by
 * position because the trailing ones - {Ix}, (Ex), [Cx], Nobility, W, RU -
 * come and go between sectors and milieux.
 */

import { parseSectorHex } from "../location";
import type { AllegianceName, BorderPath, RouteLeg } from "../charted-map";

/** Where the data comes from, and the only host this application talks to. */
export const TRAVELLER_MAP = "https://travellermap.com";

/**
 * The era the import reads, as travellermap names them.
 *
 * 1105 is the Third Imperium as the published books describe it, which is what
 * somebody asking for the Spinward Marches means by the Spinward Marches.
 */
export const MILIEU = "M1105";

/** One world as the table gives it, before anything is made of it. */
export interface WorldRow {
  /** The four digits, sector-absolute. */
  readonly at: string;
  readonly name: string;
  readonly uwp: string;
  /** The Bases column, in T5's letters-per-base form: "NS", "KM", "". */
  readonly bases: string;
  /** The Zone column as published: "A", "R", "F", "U" or "". */
  readonly zone: string;
  /** The three PBG digits, or "" where the column is blank. */
  readonly pbg: string;
  readonly allegiance: string;
  readonly stars: string;
  /** The Remarks column, which is the published trade codes and more. */
  readonly remarks: string;
}

/** A line that could not be made into a row, and why. */
export interface SkippedRow {
  /** Which line of the file, counting the header as one. */
  readonly line: number;
  readonly reason: string;
  /** Enough of the line to recognise it by. */
  readonly text: string;
}

export interface WorldTable {
  readonly rows: readonly WorldRow[];
  readonly skipped: readonly SkippedRow[];
}

/** The columns this reads. Anything else in the file is ignored. */
const WANTED = ["Hex", "Name", "UWP", "Bases", "Remarks", "Zone", "PBG", "Allegiance", "Stars"];

/**
 * The worlds in a tab-separated sector table, and the lines that were not
 * worlds.
 *
 * Forgiving about the file and strict about the hex. A row whose hex is not
 * four digits inside a sector cannot be placed, so there is nothing to do with
 * it but say so; everything else - a missing column, an unreadable profile, a
 * name nobody filled in - is a row with a hole in it rather than a row that
 * cannot exist, and the hole is better carried up and reported than guessed at
 * down here.
 */
export function parseWorldTable(text: string): WorldTable {
  const rows: WorldRow[] = [];
  const skipped: SkippedRow[] = [];
  // A byte order mark would otherwise become part of the first column's name
  // and make the header unrecognisable.
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);

  let columns: Map<string, number> | null = null;
  const seen = new Set<string>();

  for (const [at, line] of lines.entries()) {
    const number = at + 1;
    if (line.trim() === "" || line.startsWith("#")) continue;
    const cells = line.split("\t");

    if (columns === null) {
      columns = headerOf(cells);
      if (columns === null) {
        skipped.push({ line: number, reason: "not a header row", text: short(line) });
      }
      continue;
    }

    const cell = (name: string) => {
      const which = columns!.get(name);
      return which === undefined ? "" : (cells[which] ?? "").trim();
    };

    const hex = cell("Hex");
    if (parseSectorHex(hex) === null) {
      skipped.push({ line: number, reason: `${hex || "no hex"} is not a hex`, text: short(line) });
      continue;
    }
    // Last one wins, and the earlier one is reported. Two lines for one hex is
    // a broken file rather than two worlds, since a hex holds one system.
    if (seen.has(hex)) {
      skipped.push({ line: number, reason: `${hex} appears more than once`, text: short(line) });
    }
    seen.add(hex);

    rows.push({
      at: hex,
      name: cell("Name"),
      uwp: cell("UWP").toUpperCase(),
      // A dash is how the format writes "none" in a column that has a
      // vocabulary; it is not one of the values.
      bases: dashless(cell("Bases")),
      zone: dashless(cell("Zone")),
      pbg: dashless(cell("PBG")),
      allegiance: dashless(cell("Allegiance")),
      stars: cell("Stars"),
      remarks: cell("Remarks"),
    });
  }

  if (columns === null) {
    skipped.push({ line: 0, reason: "the file has no header row", text: "" });
  }
  // Hex order, so a sector reads the same way it is drawn and an import is the
  // same import whatever order the file happened to arrive in.
  return { rows: [...rows].sort((a, b) => a.at.localeCompare(b.at)), skipped };
}

/**
 * The header row as a column name to its position, or null where this is not a
 * header row.
 *
 * Recognised by holding a Hex and a UWP column, which every sector table has
 * and no world line does.
 */
function headerOf(cells: readonly string[]): Map<string, number> | null {
  const found = new Map<string, number>();
  for (const [at, cell] of cells.entries()) {
    const name = cell.trim();
    if (WANTED.includes(name) && !found.has(name)) found.set(name, at);
  }
  return found.has("Hex") && found.has("UWP") ? found : null;
}

function dashless(value: string): string {
  return value === "-" ? "" : value;
}

function short(line: string): string {
  const flat = line.replace(/\t/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}...` : flat;
}

/* The fetching ---------------------------------------------------------- */

/**
 * The fetch to use. Taken as an argument so the tests never need a network and
 * never need to replace a global, which this suite has managed without so far.
 */
export type Fetcher = (url: string) => Promise<Response>;

const theFetch: Fetcher = (url) => fetch(url);

/** One sector in the catalogue. */
export interface CataloguedSector {
  readonly name: string;
  /** The four letters the data endpoints are addressed by, such as "Spin". */
  readonly abbreviation: string;
  /** Where it is in charted space. This is what the seed is keyed on. */
  readonly x: number;
  readonly y: number;
}

/**
 * The sectors that can be imported, in name order.
 *
 * The official ones only. travellermap carries five hundred sectors of varying
 * standing, and a list of that length offering a dozen different answers to
 * "which Spinward Marches" is a worse starting point than the forty-five that
 * are the published setting.
 */
export async function fetchCatalogue(get: Fetcher = theFetch): Promise<CataloguedSector[]> {
  const raw = await json(get, `${TRAVELLER_MAP}/api/universe?requireData=1&milieu=${MILIEU}`);
  const listed = (raw as { Sectors?: unknown }).Sectors;
  if (!Array.isArray(listed)) throw new Error("The sector list came back in a shape I cannot read.");
  const out: CataloguedSector[] = [];
  for (const entry of listed) {
    const s = entry as Record<string, unknown>;
    const tags = typeof s["Tags"] === "string" ? s["Tags"].split(/\s+/) : [];
    if (!tags.includes("Official")) continue;
    const abbreviation = typeof s["Abbreviation"] === "string" ? s["Abbreviation"] : "";
    const names = Array.isArray(s["Names"]) ? s["Names"] : [];
    const first = names[0] as { Text?: unknown } | undefined;
    const name = typeof first?.Text === "string" ? first.Text : "";
    if (abbreviation === "" || name === "") continue;
    if (typeof s["X"] !== "number" || typeof s["Y"] !== "number") continue;
    out.push({ name, abbreviation, x: s["X"], y: s["Y"] });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * What a sector's metadata says, beyond its worlds.
 *
 * One request carries all of it. The subsector names were the reason for
 * asking, and the borders, the express routes and the polity names were
 * already in the answer going unread.
 */
export interface SectorMetadata {
  /** The sixteen subsectors by letter, where they are named. */
  readonly names: ReadonlyMap<string, string>;
  readonly borders: readonly BorderPath[];
  readonly routes: readonly RouteLeg[];
  readonly allegiances: readonly AllegianceName[];
}

export async function fetchMetadata(
  abbreviation: string,
  get: Fetcher = theFetch,
): Promise<SectorMetadata> {
  const raw = await json(
    get,
    `${TRAVELLER_MAP}/data/${encodeURIComponent(abbreviation)}/metadata?accept=application/json&milieu=${MILIEU}`,
  );
  return readMetadata(raw);
}

/** The metadata document read into what this application uses. Pure. */
export function readMetadata(raw: unknown): SectorMetadata {
  const held = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    names: readNames(held["Subsectors"]),
    borders: readBorders(held["Borders"]),
    routes: readRoutes(held["Routes"]),
    allegiances: readAllegiances(held["Allegiances"]),
  };
}

function readNames(raw: unknown): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    const s = entry as Record<string, unknown>;
    if (typeof s["Index"] !== "string" || typeof s["Name"] !== "string") continue;
    if (s["Name"].trim() === "") continue;
    out.set(s["Index"].toUpperCase(), s["Name"]);
  }
  return out;
}

/**
 * The borders, each a ring of hexes along the inside of a boundary.
 *
 * A polity can have more than one of them in a sector - the Imperium has four
 * in the Spinward Marches, its main body and three enclaves - so these are a
 * list rather than one per allegiance.
 */
function readBorders(raw: unknown): BorderPath[] {
  if (!Array.isArray(raw)) return [];
  const out: BorderPath[] = [];
  for (const entry of raw) {
    const s = entry as Record<string, unknown>;
    const path = typeof s["Path"] === "string" ? s["Path"].trim().split(/\s+/) : [];
    if (path.length < 3) continue;
    out.push({
      allegiance: typeof s["Allegiance"] === "string" ? s["Allegiance"] : "",
      label: typeof s["Label"] === "string" ? s["Label"] : "",
      labelAt: typeof s["LabelPosition"] === "string" ? s["LabelPosition"] : "",
      hexes: path,
    });
  }
  return out;
}

/** The express network, as the legs it is actually made of. */
function readRoutes(raw: unknown): RouteLeg[] {
  if (!Array.isArray(raw)) return [];
  const out: RouteLeg[] = [];
  for (const entry of raw) {
    const s = entry as Record<string, unknown>;
    if (typeof s["Start"] !== "string" || typeof s["End"] !== "string") continue;
    // A leg that leaves the sector names the neighbour it goes to; this map
    // has nowhere to draw that, so it is left for the sector that has.
    if (s["StartOffsetX"] !== undefined || s["EndOffsetX"] !== undefined) continue;
    if (s["StartOffsetY"] !== undefined || s["EndOffsetY"] !== undefined) continue;
    out.push({ from: s["Start"], to: s["End"] });
  }
  return out;
}

/** What each allegiance code is called, so a border can be labelled. */
function readAllegiances(raw: unknown): AllegianceName[] {
  if (!Array.isArray(raw)) return [];
  const out: AllegianceName[] = [];
  for (const entry of raw) {
    const s = entry as Record<string, unknown>;
    if (typeof s["Code"] !== "string" || typeof s["Name"] !== "string") continue;
    out.push({
      code: s["Code"],
      name: s["Name"],
      short: typeof s["ShortName"] === "string" ? s["ShortName"] : "",
    });
  }
  return out;
}

/** Every world in a sector. */
export async function fetchSectorTable(
  abbreviation: string,
  get: Fetcher = theFetch,
): Promise<WorldTable> {
  return parseWorldTable(
    await text(get, `${TRAVELLER_MAP}/data/${encodeURIComponent(abbreviation)}/tab?milieu=${MILIEU}`),
  );
}

/** Every world in one subsector, which is a far smaller thing to ask for. */
export async function fetchSubsectorTable(
  abbreviation: string,
  letter: string,
  get: Fetcher = theFetch,
): Promise<WorldTable> {
  const where = `${encodeURIComponent(abbreviation)}/${encodeURIComponent(letter.toUpperCase())}`;
  return parseWorldTable(await text(get, `${TRAVELLER_MAP}/data/${where}/tab?milieu=${MILIEU}`));
}

/**
 * A request, with its failure said in words somebody can act on.
 *
 * No headers are set: anything beyond the safelisted ones would turn this into
 * a preflighted request, and there is nothing here worth a second round trip
 * to the other side of the world.
 */
async function body(get: Fetcher, url: string): Promise<Response> {
  let response: Response;
  try {
    response = await get(url);
  } catch {
    throw new Error("Could not reach travellermap.com. Check the connection and try again.");
  }
  if (!response.ok) {
    throw new Error(`travellermap.com answered ${response.status} for that sector.`);
  }
  return response;
}

async function text(get: Fetcher, url: string): Promise<string> {
  return (await body(get, url)).text();
}

async function json(get: Fetcher, url: string): Promise<unknown> {
  const response = await body(get, url);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error("travellermap.com sent something that is not the data I asked for.");
  }
}
