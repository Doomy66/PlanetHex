/**
 * The system record, and the thing a system save file holds. SystemSpec section 9.
 *
 * A system is a seed, a name, where it sits, and whatever the user has typed over
 * what was rolled. No orbit, world or surface is stored: load rebuilds the lot
 * from the seed, as the planet spec 6.3 rebuilds a surface.
 *
 * The one generated figure the document does carry is the main world's profile,
 * under 9.1. It is what the chart above committed to and what a user clicking a
 * hex has to find, so it is written down rather than left to be derived again by
 * a generator that may since have changed its mind.
 */

import { parseSectorHex, subsectorLetter } from "./location";
import { parsePlanet, rollUwp, type Planet } from "./planet";
import { generateSystem, mainWorldSeed, type StarSystem } from "./gen/system";

/**
 * What the user has written over one orbit. Only what changed, under 9.3: a
 * system nobody has edited saves as its seed and nothing else, and a later
 * change to the generator improves the orbits nobody has touched.
 */
export interface OrbitOverride {
  /** Which orbit this is about. */
  readonly orbit: number;
  /** A world's name, where the user has given it one of its own. */
  readonly name?: string;
  /** A world's profile, where the user has typed over it. */
  readonly uwp?: string;
  /** Free prose about whatever is there. 9.3. */
  readonly note?: string;
}

export interface SystemDoc {
  /** Which level this document is, under the app spec 4.1. */
  readonly level: "system";
  readonly version: 1;
  name: string;
  /** Where the system sits, in the terms of the subsector spec 2.2. */
  sector: string;
  hex: string;
  seed: string;
  /** The profile of 5.1, written down so the document stands alone. */
  mainWorldUwp: string;
  overrides: OrbitOverride[];
  /**
   * The worlds of this system that somebody has worked on, whole. SystemSpec
   * 9.5.
   *
   * Carried rather than kept beside, because a level's save is one document: a
   * referee who has named a world and written on it should not have to think
   * about where that world's file went. Only the ones worked on - a world is
   * its seed until somebody changes something, and a system of eight worlds
   * nobody has opened carries none of them.
   */
  worlds: Planet[];
}

export function newSystemDoc(seed: string, name: string): SystemDoc {
  return {
    level: "system",
    version: 1,
    name,
    sector: "",
    hex: "",
    seed,
    mainWorldUwp: rollUwp(mainWorldSeed(seed)),
    overrides: [],
    worlds: [],
  };
}

/** The worked up world of a seed, or undefined where nobody has touched it. */
export function savedWorld(doc: SystemDoc, seed: string): Planet | undefined {
  return doc.worlds.find((held) => held.seed === seed);
}

/**
 * Put a world into the system, replacing whatever was there for that seed.
 *
 * By seed rather than by designation, because a designation moves: rename the
 * system and every world in it is called something else, and a world put down
 * as Sol-3 would be looked for as Alpha-3 and not found. The seed is the world.
 */
export function keepWorld(doc: SystemDoc, planet: Planet): void {
  const rest = doc.worlds.filter((held) => held.seed !== planet.seed);
  doc.worlds = [...rest, planet].sort((a, b) => a.seed.localeCompare(b.seed));
}

/** The subsector letter its hex falls in, or "" where the hex is not a square. */
export function subsectorOf(doc: SystemDoc): string {
  const hex = parseSectorHex(doc.hex);
  return hex === null ? "" : subsectorLetter(hex);
}

/** What the user wrote about one orbit, or undefined where they wrote nothing. */
export function overrideFor(doc: SystemDoc, orbit: number): OrbitOverride | undefined {
  return doc.overrides.find((held) => held.orbit === orbit);
}

/**
 * Write one field of one orbit's override, or clear it where the value is empty.
 *
 * Clearing rather than storing a blank is what keeps 9.3's promise: an override
 * the user has emptied is an override they have taken back, and a document full
 * of empty strings is a document that has stopped saying only what changed.
 */
export function setOverride(
  doc: SystemDoc,
  orbit: number,
  field: "name" | "uwp" | "note",
  value: string,
): void {
  const rest = doc.overrides.filter((held) => held.orbit !== orbit);
  const held = overrideFor(doc, orbit);
  const next: OrbitOverride & Record<string, unknown> = { ...held, orbit, [field]: value.trim() };
  if (value.trim() === "") delete next[field];
  const empty = next.name === undefined && next.uwp === undefined && next.note === undefined;
  doc.overrides = empty ? rest : [...rest, next].sort((a, b) => a.orbit - b.orbit);
}

/**
 * The system a document describes: generated from its seed, with what the user
 * typed laid over the top. SystemSpec 9.2.
 *
 * The stored main world profile is applied the same way an override is. It will
 * be what the seed rolls in every ordinary case; where it is not, the document
 * is what the user has, and a generator that has since changed its mind does not
 * get to change their system under them.
 */
export function systemOf(doc: SystemDoc): StarSystem {
  const system = generateSystem(doc.seed);
  const main = system.mainWorld;
  const stored = doc.mainWorldUwp.trim().toUpperCase();
  const orbits = system.orbits.map((orbit) => {
    const content = orbit.content;
    if (content.kind !== "world") return orbit;
    const held = overrideFor(doc, orbit.index);
    const uwp = held?.uwp ?? (content.main && stored !== "" ? stored : content.uwp);
    if (uwp === content.uwp) return orbit;
    return { ...orbit, content: { ...content, uwp } };
  });
  const mainUwp =
    overrideFor(doc, main.orbitIndex)?.uwp ?? (stored === "" ? main.uwp : stored);
  return { ...system, orbits, mainWorld: { ...main, uwp: mainUwp } };
}

/**
 * Reads a system document back, or throws saying why not. The same contract the
 * planet spec 6.4.3 sets: a document that cannot produce the system it claims to
 * be fails loudly rather than opening a different one under the right name.
 */
export function parseSystemDoc(text: string): SystemDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (typeof raw !== "object" || raw === null) throw new Error("That file is not a system.");
  const r = raw as Record<string, unknown>;
  if (r["level"] !== "system") {
    throw new Error(`That file is a ${describeLevel(r["level"])}, not a system.`);
  }
  if (r["version"] !== 1) {
    throw new Error(`Save version ${String(r["version"])} is not one this build understands.`);
  }
  if (typeof r["seed"] !== "string" || r["seed"] === "") {
    throw new Error("The save has no seed, so its system cannot be rebuilt.");
  }
  const seed = r["seed"];
  return {
    level: "system",
    version: 1,
    name: typeof r["name"] === "string" ? r["name"] : "Unnamed",
    sector: typeof r["sector"] === "string" ? r["sector"] : "",
    hex: typeof r["hex"] === "string" ? r["hex"] : "",
    seed,
    mainWorldUwp:
      typeof r["mainWorldUwp"] === "string" && r["mainWorldUwp"] !== ""
        ? r["mainWorldUwp"]
        : rollUwp(mainWorldSeed(seed)),
    overrides: parseOverrides(r["overrides"]),
    worlds: parseWorlds(r["worlds"]),
  };
}

/**
 * The worlds carried in a system document. A world that cannot be read is left
 * out rather than taking the system down with it: the rest of the system is
 * still the system, and the world is rebuildable from its seed.
 */
function parseWorlds(raw: unknown): Planet[] {
  if (!Array.isArray(raw)) return [];
  const out: Planet[] = [];
  for (const entry of raw) {
    try {
      out.push(parsePlanet(JSON.stringify(entry)));
    } catch {
      // Left out.
    }
  }
  return out;
}

/** What a file says it is, for the complaint in parseSystemDoc. */
function describeLevel(level: unknown): string {
  return typeof level === "string" && level !== "" ? level : "planet or something else";
}

function parseOverrides(raw: unknown): OrbitOverride[] {
  if (!Array.isArray(raw)) return [];
  const out: OrbitOverride[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const r = entry as Record<string, unknown>;
    const orbit = r["orbit"];
    if (typeof orbit !== "number" || !Number.isInteger(orbit) || orbit < 0) continue;
    const text = (key: string) => (typeof r[key] === "string" && r[key] !== "" ? r[key] : undefined);
    const held: OrbitOverride = {
      orbit,
      ...(text("name") === undefined ? {} : { name: text("name")! }),
      ...(text("uwp") === undefined ? {} : { uwp: text("uwp")! }),
      ...(text("note") === undefined ? {} : { note: text("note")! }),
    };
    if (held.name === undefined && held.uwp === undefined && held.note === undefined) continue;
    out.push(held);
  }
  return out.sort((a, b) => a.orbit - b.orbit);
}
