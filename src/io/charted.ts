/**
 * Turning a published sector into documents of our own. AppSpec 8.3.
 *
 * Pure, and deliberately so: everything here is a function of the rows, the
 * sector's place in charted space, and nothing else. No fetching, no clock, no
 * randomness. The same sector imported twice is the same two documents.
 *
 * What arrives is a name, a profile, bases, a zone, stars, a PBG and an
 * allegiance - a line on a map. What is underneath each of those worlds, which
 * is the surface, the orbits, the moons and the cities, is this application's
 * to generate, and generation needs a seed. So the import writes canon on top
 * of a seeded world rather than instead of one: section 9.3.2.
 */

import { collapseBases } from "../gen/base";
import { seedFrom } from "../planet";
import { parseUwp } from "../planet";
import { subsectorSeedFor } from "../gen/sector";
import { SUBSECTOR_LETTERS, parseSectorHex, subsectorLetter } from "../location";
import { newSectorDoc, type SectorDoc } from "../sector";
import { newSubsectorDoc, type HexOverride, type SubsectorDoc } from "../subsector";
import type { SectorMetadata, WorldRow } from "./travellermap";
import { chartedIsEmpty, type ChartedMap } from "../charted-map";
import type { ChartedSource } from "../source";

export type { ChartedSource };

/** What the import could not do, to be reported rather than buried. */
export interface ImportReport {
  readonly worlds: number;
  /** Worlds whose published profile is not a profile anything can read. */
  readonly unreadable: readonly string[];
  /** Worlds the published data leaves unnamed. */
  readonly unnamed: readonly string[];
  /**
   * Hexes the published data claims and leaves entirely blank - no name and no
   * profile - and which this application therefore generates. 8.6.2.
   *
   * These are counted apart from the unreadable and the unnamed because they
   * are not a gap in the data. A Preserve sector is published blank on purpose,
   * and a referee opening one should be told how much of it is theirs.
   */
  readonly blank: readonly string[];
}

export interface ImportedSector {
  readonly doc: SectorDoc;
  readonly report: ImportReport;
}

export interface ImportedSubsector {
  readonly doc: SubsectorDoc;
  readonly report: ImportReport;
}

/**
 * The seed a published sector is rebuilt from. AppSpec 8.3.1.
 *
 * Keyed on where the sector is and nothing else, because where it is cannot
 * change. Not the milieu - a world at 1105 and the same world at 1120 are one
 * rock with two profiles written on it, and they should have one surface. Not
 * the name, which the catalogue gives differently in different languages. And
 * above all not the profile, so that when the Second Survey corrects a UWP
 * upstream the world's ground stays exactly where it was and only its digits
 * move.
 *
 * Everything below follows from this by the ordinary chain - subsector, system,
 * world - so Regina's terrain is the same for every user on every machine, and
 * the same whether the sector was imported whole or that one subsector was
 * imported on its own.
 */
export function chartedSeed(x: number, y: number): string {
  return seedFrom("travellermap", `${x},${y}`);
}

/**
 * A published subsector as a document. AppSpec 8.3.
 *
 * Density "none", so there is no rolled world underneath for a later change of
 * mind about density to let in between the real ones, and one override per
 * published world saying what that world is. Every world on the result is a
 * world somebody put there.
 */
export function importSubsector(
  rows: readonly WorldRow[],
  source: ChartedSource,
  letter: string,
  name: string,
  meta?: SectorMetadata,
): ImportedSubsector {
  const which = letter.toUpperCase();
  const sectorSeed = chartedSeed(source.x, source.y);
  const doc = newSubsectorDoc(subsectorSeedFor(sectorSeed, which), which, "none", name);
  doc.sector = source.sector;
  // A published sector is not leaning one way or the other: every profile on
  // it is given rather than rolled, so a thumb on the dice has nothing to
  // press against and would only mislead whoever read it. 3.11.
  doc.shifts = { population: 0, tech: 0 };
  doc.source = source;
  // The whole sector's borders and routes, not just this subsector's share of
  // them: a border runs across the edge, and a subsector that trimmed it would
  // show a line where the map has none.
  const charted = meta === undefined ? undefined : chartedFrom(meta);
  if (charted !== undefined) doc.charted = charted;

  const unreadable: string[] = [];
  const unnamed: string[] = [];
  const blank: string[] = [];
  const overrides: HexOverride[] = [];

  for (const row of rows) {
    const hex = parseSectorHex(row.at);
    if (hex === null || subsectorLetter(hex) !== which) continue;
    overrides.push(overrideFrom(row, unreadable, unnamed, blank));
  }

  doc.overrides = overrides.sort((a, b) => a.at.localeCompare(b.at));
  return { doc, report: { worlds: overrides.length, unreadable, unnamed, blank } };
}

/**
 * A published sector as a document, with all sixteen subsectors in it.
 *
 * All sixteen whether or not they hold anything, because a letter the document
 * does not carry is a letter the sector generates for itself, and a generated
 * subsector in the middle of a published one is the one thing this must not
 * do.
 */
export function importSector(
  rows: readonly WorldRow[],
  source: ChartedSource,
  meta: SectorMetadata,
): ImportedSector {
  const doc = newSectorDoc(chartedSeed(source.x, source.y), source.sector, "none");
  doc.shifts = { population: 0, tech: 0 };
  doc.source = source;
  const charted = chartedFrom(meta);
  if (charted !== undefined) doc.charted = charted;

  let worlds = 0;
  const unreadable: string[] = [];
  const unnamed: string[] = [];
  const blank: string[] = [];

  doc.subsectors = [...SUBSECTOR_LETTERS].map((letter) => {
    const held = importSubsector(rows, source, letter, meta.names.get(letter) ?? `Subsector ${letter}`, meta);
    worlds += held.report.worlds;
    unreadable.push(...held.report.unreadable);
    unnamed.push(...held.report.unnamed);
    blank.push(...held.report.blank);
    return { letter, doc: held.doc };
  });

  return { doc, report: { worlds, unreadable, unnamed, blank } };
}

/** The borders, routes and names worth carrying, or nothing where there are none. */
function chartedFrom(meta: SectorMetadata): ChartedMap | undefined {
  const map: ChartedMap = {
    borders: meta.borders,
    routes: meta.routes,
    allegiances: meta.allegiances,
  };
  return chartedIsEmpty(map) ? undefined : map;
}

/**
 * One published world as the override that puts it in its hex.
 *
 * `present` is true on every one of them: at density "none" nothing is in a
 * hex until something says so, and this is the saying so.
 *
 * Past that there are two kinds of row, written over very differently. A row
 * the setting has detailed is authoritative to its last blank column: "no
 * bases" is a fact about that world, and pinning the empty string is what stops
 * the generator inventing a naval depot next door to Regina. A row carrying no
 * name and no readable profile has detailed nothing - it is a claim on a hex -
 * so it pins the claim and leaves the world itself to be generated. 8.6.2.
 */
function overrideFrom(
  row: WorldRow,
  unreadable: string[],
  unnamed: string[],
  blank: string[],
): HexOverride {
  const readable = parseUwp(row.uwp) !== null;
  const named = row.name.trim() !== "";
  // Named or profiled, the setting has said something about this world and
  // every column of the row is taken as said. Neither, and it has not.
  const detailed = readable || named;

  if (detailed && !readable) unreadable.push(row.at);
  if (detailed && !named) unnamed.push(row.at);
  if (!detailed) blank.push(row.at);

  const notes: string[] = [];
  if (detailed && !readable) {
    // Without this the hex would keep the canon name over a rolled profile and
    // look exactly as published as its neighbours. A world whose profile is
    // not known should say that it is not known.
    notes.push(`Published profile ${row.uwp || "(blank)"} is not a readable UWP.`);
  }
  if (!detailed) {
    // Said plainly, because the difference matters: this is not a world the
    // setting got wrong, it is one the setting left to the referee.
    notes.push("The published map claims this hex and details no world in it. Generated.");
  }
  if (row.remarks.trim() !== "") {
    // The trade codes are worked out again from the profile, so the published
    // Remarks are not applied - but they carry things no profile implies, from
    // ownership to who lives there, and throwing them away loses more than it
    // saves.
    notes.push(`Published remarks: ${row.remarks.trim()}`);
  }

  // What every row pins, detailed or not: where it is, that something is there,
  // and who claims it. The allegiance is the whole substance of a blank row,
  // and it is also what decides how the generated world is named.
  const claim: HexOverride = {
    at: row.at,
    present: true,
    ...(row.allegiance.trim() === "" ? {} : { allegiance: row.allegiance.trim() }),
    ...(notes.length === 0 ? {} : { note: notes.join("\n") }),
  };

  if (!detailed) {
    // Nothing else. Name, profile, bases, stars and PBG are all the
    // generator's. A zone is kept where the map marks one, because a travel
    // zone is a warning somebody put there deliberately and survives a hex
    // having no world written in it.
    const zone = readZone(row.zone);
    return { ...claim, ...(zone === "" ? {} : { zone }) };
  }

  return {
    ...claim,
    name: named ? row.name.trim() : row.at,
    ...(readable ? { uwp: row.uwp } : {}),
    bases: collapseBases(row.bases),
    // The letters as published, for an application that tells the kinds apart (8.7).
    ...(row.bases.trim() === "" ? {} : { publishedBases: row.bases.trim().toUpperCase() }),
    zone: readZone(row.zone),
    ...(row.stars.trim() === "" ? {} : { stars: row.stars.trim() }),
    ...(row.pbg.trim() === "" ? {} : { pbg: row.pbg.trim() }),
  };
}

/**
 * The published Zone column in the two this application draws.
 *
 * Amber and red are the two a map has. Forbidden is redder than red, so it
 * becomes red rather than disappearing; unabsorbed describes who governs a
 * region rather than whether a ship should go there, and has no colour.
 */
function readZone(published: string): string {
  const zone = published.trim().toUpperCase();
  if (zone === "A" || zone === "R") return zone;
  if (zone === "F") return "R";
  return "";
}
