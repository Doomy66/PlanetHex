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
  const overrides: HexOverride[] = [];

  for (const row of rows) {
    const hex = parseSectorHex(row.at);
    if (hex === null || subsectorLetter(hex) !== which) continue;
    overrides.push(overrideFrom(row, unreadable, unnamed));
  }

  doc.overrides = overrides.sort((a, b) => a.at.localeCompare(b.at));
  return { doc, report: { worlds: overrides.length, unreadable, unnamed } };
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

  doc.subsectors = [...SUBSECTOR_LETTERS].map((letter) => {
    const held = importSubsector(rows, source, letter, meta.names.get(letter) ?? `Subsector ${letter}`, meta);
    worlds += held.report.worlds;
    unreadable.push(...held.report.unreadable);
    unnamed.push(...held.report.unnamed);
    return { letter, doc: held.doc };
  });

  return { doc, report: { worlds, unreadable, unnamed } };
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
 */
function overrideFrom(row: WorldRow, unreadable: string[], unnamed: string[]): HexOverride {
  const readable = parseUwp(row.uwp) !== null;
  if (!readable) unreadable.push(row.at);
  const named = row.name.trim() !== "";
  if (!named) unnamed.push(row.at);

  const notes: string[] = [];
  if (!readable) {
    // Without this the hex would keep the canon name over a rolled profile and
    // look exactly as published as its neighbours. A world whose profile is
    // not known should say that it is not known.
    notes.push(`Published profile ${row.uwp || "(blank)"} is not a readable UWP.`);
  }
  if (row.remarks.trim() !== "") {
    // The trade codes are worked out again from the profile, so the published
    // Remarks are not applied - but they carry things no profile implies, from
    // ownership to who lives there, and throwing them away loses more than it
    // saves.
    notes.push(`Published remarks: ${row.remarks.trim()}`);
  }

  return {
    at: row.at,
    present: true,
    // An unnamed hex gets its number rather than nothing, because nothing lets
    // the generator supply a name that reads as published as the rest.
    name: named ? row.name.trim() : row.at,
    ...(readable ? { uwp: row.uwp } : {}),
    bases: collapseBases(row.bases),
    zone: readZone(row.zone),
    ...(row.stars.trim() === "" ? {} : { stars: row.stars.trim() }),
    ...(row.pbg.trim() === "" ? {} : { pbg: row.pbg.trim() }),
    ...(row.allegiance.trim() === "" ? {} : { allegiance: row.allegiance.trim() }),
    ...(notes.length === 0 ? {} : { note: notes.join("\n") }),
  };
}

/**
 * The published Bases column in the three letters this application has.
 * AppSpec 8.3.3.
 *
 * T5 writes one letter per base and several per system, telling a Vargr
 * corsair base from an Aslan clan base from an Imperial depot. A subsector here
 * draws two marks, naval and scout, so the letters are sorted into those two
 * and the rest dropped. What is lost is whose navy it is, which the Allegiance
 * column says anyway.
 */
/** Corsair, depot, naval, military, clan, naval, Tlaukhu - somebody's navy. */
const NAVAL = "CDKMNRT";
/** Scout, exploration, way station - somebody's survey service. */
const SCOUT = "SVW";

function collapseBases(published: string): string {
  const letters = published.trim().toUpperCase();
  const naval = [...letters].some((one) => NAVAL.includes(one));
  const scout = [...letters].some((one) => SCOUT.includes(one));
  if (naval && scout) return "A";
  if (naval) return "N";
  if (scout) return "S";
  return "";
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
