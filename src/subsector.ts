/**
 * The subsector record, and the thing a subsector save file holds.
 * SubSectorSpec section 5.
 *
 * A subsector is a seed, a letter, a density, a name, and whatever the referee
 * has written over what was rolled. No world is stored: load rebuilds all eighty
 * hexes from the seed and the density, exactly as the planet spec 6.3 rebuilds a
 * surface and the system spec 9.2 an orbit.
 */

import {
  DEFAULT_DENSITY,
  DENSITIES,
  generateSubsector,
  routesBetween,
  worldAt,
  type ChartWorld,
  type Density,
  type Subsector,
} from "./gen/subsector";
import { systemSeedFor } from "./gen/subsector";
import { parseSystemDoc, type SystemDoc } from "./system";
import { formatSectorHex, parseSectorHex, subsectorHexes } from "./location";
import { parseUwp } from "./planet";
import { tradeCodes } from "./gen/trade";

/**
 * What the referee has written over one hex. Only what changed, under 5.3.1: a
 * chart nobody has edited saves as its seed and nothing else, and a later change
 * to the generator improves the worlds nobody has touched while leaving the ones
 * they have alone.
 */
export interface HexOverride {
  /** The four digits of the hex this is about. */
  readonly at: string;
  readonly name?: string;
  readonly uwp?: string;
  /** The Bases column: "A", "N", "S" or "" for none. */
  readonly bases?: string;
  /** The Zone column: "A", "R" or "" for green. */
  readonly zone?: string;
  /** Free prose about the system. 5.3.2. */
  readonly note?: string;
  /**
   * Whether the hex holds a system at all, where the referee has overruled the
   * density. 3.2.3 and 5.3.4.
   */
  readonly present?: boolean;
  /**
   * The seed of the system in this hex, where the referee has rolled a
   * different one. 5.3.5.
   *
   * The hex's own seed is derived from the subsector's under 3.1.3, and that is
   * what a hex holds until somebody deliberately replaces it. Storing the
   * replacement is what keeps the chart and the system view agreeing about what
   * is in the hex: without it, a reroll would show one system and the chart
   * would go on drawing another.
   */
  readonly systemSeed?: string;
}

/** The fields of an override that are plain text. */
export type HexField = "name" | "uwp" | "bases" | "zone" | "note";

export interface SubsectorDoc {
  /** Which level this document is, under the app spec 4.1. */
  readonly level: "subsector";
  readonly version: 1;
  name: string;
  /** The sector it belongs to, see 2.2.1. Free text. */
  sector: string;
  /** A to P, see 2.2.3. */
  letter: string;
  seed: string;
  density: Density;
  overrides: HexOverride[];
  /**
   * The systems under this chart that somebody has worked on, by hex, each
   * carrying its own worked up worlds. SubSectorSpec 5.7.
   *
   * One document for the level you opened. A referee working down from a chart
   * should press Save once and have everything they touched kept, rather than
   * saving three times at three levels and keeping track of which folder each
   * of them went into.
   *
   * Only what was worked on. A hex nobody has opened is its seed, and eighty
   * systems describing what the seed already describes is eighty systems of
   * nothing.
   */
  systems: { at: string; doc: SystemDoc }[];
}

export function newSubsectorDoc(
  seed: string,
  letter: string,
  density: Density = DEFAULT_DENSITY,
  name = "",
): SubsectorDoc {
  return {
    level: "subsector",
    version: 1,
    name,
    sector: "",
    letter: letter.toUpperCase(),
    seed,
    density,
    overrides: [],
    systems: [],
  };
}

/** The worked up system in a hex, or undefined where nobody has been in. */
export function savedSystem(doc: SubsectorDoc, at: string): SystemDoc | undefined {
  return doc.systems.find((held) => held.at === at)?.doc;
}

/** Put a system into a hex, replacing whatever was there. */
export function keepSystem(doc: SubsectorDoc, at: string, system: SystemDoc): void {
  const rest = doc.systems.filter((held) => held.at !== at);
  doc.systems = [...rest, { at, doc: system }].sort((a, b) => a.at.localeCompare(b.at));
}

/** Forget a hex's system, when a different one has been rolled into it. */
export function dropSystem(doc: SubsectorDoc, at: string): void {
  doc.systems = doc.systems.filter((held) => held.at !== at);
}

/** What the referee wrote about one hex, or undefined where they wrote nothing. */
export function overrideFor(doc: SubsectorDoc, at: string): HexOverride | undefined {
  return doc.overrides.find((held) => held.at === at);
}

/** Whether an override says anything at all, or has been emptied back out. */
function saysNothing(held: HexOverride): boolean {
  return (
    held.name === undefined &&
    held.uwp === undefined &&
    held.bases === undefined &&
    held.zone === undefined &&
    held.note === undefined &&
    held.present === undefined &&
    held.systemSeed === undefined
  );
}

function put(doc: SubsectorDoc, at: string, next: HexOverride): void {
  const rest = doc.overrides.filter((held) => held.at !== at);
  doc.overrides = saysNothing(next) ? rest : [...rest, next].sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Write one field of one hex, or clear it where the value is empty.
 *
 * Clearing rather than storing a blank is what keeps 5.3.1's promise: a field
 * the referee has emptied is a field they have taken back, and a document full
 * of empty strings has stopped saying only what changed.
 */
export function setOverride(doc: SubsectorDoc, at: string, field: HexField, value: string): void {
  const held = overrideFor(doc, at);
  const next: HexOverride & Record<string, unknown> = { ...held, at, [field]: value.trim() };
  if (value.trim() === "") delete next[field];
  put(doc, at, next);
}

/**
 * Say whether a hex holds a system, against what the density decided. 5.3.4.
 *
 * Passing the generated answer back in clears the override rather than storing
 * agreement: a referee who turns a hex on and then off again has said nothing.
 */
export function setPresence(doc: SubsectorDoc, at: string, present: boolean, rolled: boolean): void {
  const held = overrideFor(doc, at);
  const next: HexOverride & Record<string, unknown> = { ...held, at, present };
  // Agreement is not an override: a referee who turns a hex on and then off
  // again has said nothing, and the field goes rather than storing the say-so.
  if (present === rolled) delete (next as Record<string, unknown>)["present"];
  put(doc, at, next);
}

/**
 * Put a different system into a hex. 5.3.5.
 *
 * Passing the hex's own seed back in clears the override, since a referee who
 * has rolled their way back to what was there has said nothing.
 */
export function setSystemSeed(doc: SubsectorDoc, at: string, seed: string, rolled: string): void {
  const held = overrideFor(doc, at);
  const next: HexOverride & Record<string, unknown> = { ...held, at, systemSeed: seed };
  if (seed === rolled) delete (next as Record<string, unknown>)["systemSeed"];
  put(doc, at, next);
}

/** The seed of the system in a hex, the referee's if they have put one there. */
export function systemSeedIn(doc: SubsectorDoc, at: string): string {
  return overrideFor(doc, at)?.systemSeed ?? systemSeedFor(doc.seed, at);
}

/**
 * The chart a document describes: generated from its seed and density, with what
 * the referee wrote laid over the top. SubSectorSpec 5.2.
 *
 * An override never changes a world's seed, under 5.3.3. The seed is the world;
 * the override is what the referee says about it, so a hand-typed profile lands
 * on the world that was always in that hex.
 */
export function subsectorOf(doc: SubsectorDoc): Subsector {
  const rolled = generateSubsector(doc.seed, doc.letter, doc.density);
  if (doc.overrides.length === 0) return rolled;

  const held = new Map(rolled.worlds.map((world) => [world.at, world]));

  for (const override of doc.overrides) {
    const hex = parseSectorHex(override.at);
    if (hex === null) continue;
    // A hex the referee turned on that the density left empty, 5.3.4 - dropping
    // it would lose written work to a slider - and a hex whose system they have
    // rolled again, 5.3.5.
    const wanted = override.present === true && !held.has(override.at);
    const replaced = override.systemSeed !== undefined && held.has(override.at);
    if (!wanted && !replaced) continue;
    const world = worldAt(doc.seed, override.at, hex, undefined, override.systemSeed);
    if (world !== null) held.set(override.at, world);
  }

  const worlds: ChartWorld[] = [];
  for (const hex of subsectorHexes(doc.letter)) {
    const at = formatSectorHex(hex);
    const world = held.get(at);
    if (world === undefined) continue;
    const override = overrideFor(doc, at);
    if (override?.present === false) continue;
    worlds.push(override === undefined ? world : wearing(world, override));
  }

  return { ...rolled, worlds, routes: routesBetween(worlds) };
}

/** One world, wearing what the referee wrote on it. */
function wearing(world: ChartWorld, override: HexOverride): ChartWorld {
  const uwp = override.uwp?.trim().toUpperCase();
  const profile = uwp === undefined ? null : parseUwp(uwp);
  // A profile that is not a profile is not applied. The referee is mid-typing,
  // and half a UWP should not blank the world they are typing it over.
  const changed = profile === null ? world.uwp : uwp!;
  return {
    ...world,
    name: override.name ?? world.name,
    uwp: changed,
    profile: profile ?? world.profile,
    trade: profile === null ? world.trade : tradeCodes(changed),
    bases: override.bases ?? world.bases,
    zone: override.zone ?? world.zone,
  };
}

/**
 * Reads a subsector document back, or throws saying why not. The same contract
 * the planet spec 6.4.3 sets: a document that cannot produce the chart it claims
 * to be fails loudly rather than opening a different one under the right name.
 */
export function parseSubsectorDoc(text: string): SubsectorDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (typeof raw !== "object" || raw === null) throw new Error("That file is not a subsector.");
  const r = raw as Record<string, unknown>;
  if (r["level"] !== "subsector") {
    throw new Error(`That file is a ${describeLevel(r["level"])}, not a subsector.`);
  }
  if (r["version"] !== 1) {
    throw new Error(`Save version ${String(r["version"])} is not one this build understands.`);
  }
  if (typeof r["seed"] !== "string" || r["seed"] === "") {
    throw new Error("The save has no seed, so its chart cannot be rebuilt.");
  }
  const letter = typeof r["letter"] === "string" ? r["letter"].toUpperCase() : "";
  if (!"ABCDEFGHIJKLMNOP".includes(letter) || letter === "") {
    throw new Error(`"${String(r["letter"])}" is not a subsector letter.`);
  }
  const density = r["density"];
  return {
    level: "subsector",
    version: 1,
    name: typeof r["name"] === "string" ? r["name"] : "Unnamed",
    sector: typeof r["sector"] === "string" ? r["sector"] : "",
    letter,
    seed: r["seed"],
    density:
      typeof density === "string" && density in DENSITIES ? (density as Density) : DEFAULT_DENSITY,
    overrides: parseOverrides(r["overrides"]),
    systems: parseSystems(r["systems"]),
  };
}

/**
 * The systems carried in a subsector document. One that cannot be read is left
 * out rather than taking the chart down with it: the hex still has a seed, and
 * the seed still makes a system.
 */
function parseSystems(raw: unknown): { at: string; doc: SystemDoc }[] {
  if (!Array.isArray(raw)) return [];
  const out: { at: string; doc: SystemDoc }[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const r = entry as Record<string, unknown>;
    const at = r["at"];
    if (typeof at !== "string" || parseSectorHex(at) === null) continue;
    try {
      out.push({ at, doc: parseSystemDoc(JSON.stringify(r["doc"])) });
    } catch {
      // Left out.
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** What a file says it is, for the complaint in parseSubsectorDoc. */
function describeLevel(level: unknown): string {
  return typeof level === "string" && level !== "" ? level : "planet or something else";
}

function parseOverrides(raw: unknown): HexOverride[] {
  if (!Array.isArray(raw)) return [];
  const out: HexOverride[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const r = entry as Record<string, unknown>;
    const at = r["at"];
    if (typeof at !== "string" || parseSectorHex(at) === null) continue;
    const text = (key: string) => (typeof r[key] === "string" && r[key] !== "" ? r[key] : undefined);
    const present = typeof r["present"] === "boolean" ? r["present"] : undefined;
    const held: HexOverride = {
      at,
      ...(text("name") === undefined ? {} : { name: text("name")! }),
      ...(text("uwp") === undefined ? {} : { uwp: text("uwp")! }),
      ...(text("bases") === undefined ? {} : { bases: text("bases")! }),
      ...(text("zone") === undefined ? {} : { zone: text("zone")! }),
      ...(text("note") === undefined ? {} : { note: text("note")! }),
      ...(present === undefined ? {} : { present }),
      ...(text("systemSeed") === undefined ? {} : { systemSeed: text("systemSeed")! }),
    };
    if (saysNothing(held)) continue;
    out.push(held);
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
