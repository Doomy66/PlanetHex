import { DEFAULT_DETAIL, DETAIL_LEVELS, nearestDetail } from "./grid/coord";
import { valueFor } from "./gen/rng";
import { splitLegacyLocation } from "./location";
import { parsePois, type Poi } from "./poi";

/**
 * The planet record, and the thing a save file holds. Spec.md section 6.1.
 *
 * Heights are absent on purpose: they are rebuilt from seed and size on load, so
 * a save can never disagree with what the generator produces.
 */
export interface Planet {
  /** Save format version, so a later phase can add fields. Spec 6.4.2. */
  readonly version: 1;
  name: string;
  /** The sector the world sits in, free text. Spec 6.14. */
  sector: string;
  /** Its four digit hex within that sector, held as typed. Spec 6.14. */
  hex: string;
  uwp: string;
  narrative: string;
  /**
   * The world settings of 6.15, where the user has overruled what was rolled.
   * Null means the rolled value stands, so a save carries only what was changed
   * and a planet left alone re-derives the lot from its seed and its UWP.
   */
  tiltDeg: number | null;
  orbitAu: number | null;
  rotationHours: number | null;
  seed: string;
  /** The detail level of 2.2.1, one of DETAIL_LEVELS. */
  size: number;
  /** The points of interest of 6.5, keyed by the hex name of 2.4. */
  pois: Poi[];
}

export const DEFAULT_SIZE = DEFAULT_DETAIL;

export function newPlanet(seed = randomSeed()): Planet {
  return {
    version: 1,
    name: "Unnamed",
    sector: "",
    hex: "",
    uwp: rollUwp(seed),
    narrative: "",
    tiltDeg: null,
    orbitAu: null,
    rotationHours: null,
    seed,
    size: DEFAULT_DETAIL,
    pois: [],
  };
}

/** A short readable seed. Uses Math.random because this is a choice, not generation. */
export function randomSeed(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Starport class by 2D roll, index 2 to 12. Traveller SRD, world creation.
 */
const STARPORT_BY_ROLL = ["", "", "X", "E", "E", "D", "D", "C", "C", "B", "B", "A", "A"];

/** Highest value each position can take, in UWP order. Spec 6.7.1. */
const SIZE_LIMIT = 10;
const ATMOSPHERE_LIMIT = 15;
const HYDROGRAPHICS_LIMIT = 10;
const POPULATION_LIMIT = 12;
const GOVERNMENT_LIMIT = 13;
const LAW_LIMIT = 9;
const TECH_LIMIT = 15;

/** Atmospheres that will not hold surface water: none, trace, exotic, corrosive, insidious. */
const WATERLESS_ATMOSPHERES = new Set([0, 1, 10, 11, 12]);

/**
 * Rolls a world to the Traveller world creation rules. Spec 6.7.2.
 *
 * Every position is 2D, chained off the ones before it, so the digits describe one
 * world rather than eight unrelated numbers: a small world holds little air, a
 * thin or corrosive atmosphere keeps little water, and nothing is governed or
 * built where nobody lives. Tech level is 1D plus modifiers from all of it.
 *
 * The dice come from the seed rather than Math.random, so the profile is part of
 * what the seed names and a shared seed brings the same world with it.
 */
export function rollUwp(seed: string): string {
  let die = 0;
  const d6 = () => Math.floor(valueFor(seed + ":uwp", die++) * 6) + 1;
  const roll2 = () => d6() + d6();
  // Every roll is taken whether or not it is used, so a digit forced to 0 by the
  // rules below cannot shift the dice the later digits read.
  const rolls = { size: roll2(), atmosphere: roll2(), hydrographics: roll2() };

  const starport = STARPORT_BY_ROLL[roll2()]!;
  const size = clamp(rolls.size - 2, SIZE_LIMIT);
  // A world with no size has no gravity well, so nothing to hold air or water.
  const atmosphere = size === 0 ? 0 : clamp(rolls.atmosphere - 7 + size, ATMOSPHERE_LIMIT);
  const waterDm = WATERLESS_ATMOSPHERES.has(atmosphere) ? -4 : 0;
  const hydrographics =
    size <= 1 ? 0 : clamp(rolls.hydrographics - 7 + size + waterDm, HYDROGRAPHICS_LIMIT);

  const population = clamp(roll2() - 2, POPULATION_LIMIT);
  const governmentRoll = roll2();
  const lawRoll = roll2();
  const techRoll = d6();
  // An empty world has no government, no laws and no industry. SRD: population 0
  // sets the remaining three to 0.
  const government = population === 0 ? 0 : clamp(governmentRoll - 7 + population, GOVERNMENT_LIMIT);
  const law = population === 0 ? 0 : clamp(lawRoll - 7 + government, LAW_LIMIT);
  const profile = { starport, size, atmosphere, hydrographics, population, government, law };
  const tech = population === 0 ? 0 : clamp(techRoll + techLevelDm(profile), TECH_LIMIT);

  const digits = [size, atmosphere, hydrographics, population, government, law];
  return `${starport}${digits.map(hexDigit).join("")}-${hexDigit(tech)}`;
}

/** Clamps a rolled value to 0 and the position's ceiling. */
function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(0, value));
}

function hexDigit(value: number): string {
  return value.toString(16).toUpperCase();
}

/**
 * The tech level modifiers, summed. A good starport, a hostile world that has to
 * be engineered around, and a large population all push it up; isolation pushes
 * it down. The atmosphere row covers the digits that need sealed habitats:
 * 0 to 3 for too little air, A to F for air that cannot be breathed as it is.
 */
const STARPORT_TECH_DM: Record<string, number> = { A: 6, B: 4, C: 2, D: 0, E: 0, X: -4 };

function techLevelDm(w: Omit<Uwp, "tech">): number {
  let dm = 0;
  dm += STARPORT_TECH_DM[w.starport] ?? 0;
  if (w.size <= 1) dm += 2;
  else if (w.size <= 4) dm += 1;
  if (w.atmosphere <= 3 || w.atmosphere >= 10) dm += 1;
  if (w.hydrographics === 0 || w.hydrographics === 9) dm += 1;
  else if (w.hydrographics === 10) dm += 2;
  if (w.population >= 1 && w.population <= 5) dm += 1;
  else if (w.population === 9) dm += 1;
  else if (w.population === 10) dm += 2;
  else if (w.population === 11) dm += 3;
  else if (w.population >= 12) dm += 4;
  if (w.government === 0 || w.government === 5) dm += 1;
  else if (w.government === 7) dm += 2;
  else if (w.government === 13 || w.government === 14) dm -= 2;
  return dm;
}

/** Validates a loaded save. Spec 6.4.3: fail loudly rather than open a different world. */
export function parsePlanet(text: string): Planet {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (typeof raw !== "object" || raw === null) throw new Error("That file is not a planet.");
  const r = raw as Record<string, unknown>;
  if (r["version"] !== 1) {
    throw new Error(`Save version ${String(r["version"])} is not one this build understands.`);
  }
  if (typeof r["seed"] !== "string" || r["seed"] === "") {
    throw new Error("The save has no seed, so its surface cannot be rebuilt.");
  }
  if (typeof r["size"] !== "number" || !Number.isInteger(r["size"]) || r["size"] < 1) {
    throw new Error("The save has no usable detail level, so its surface cannot be rebuilt.");
  }
  // A level off the ladder is snapped rather than refused. Under 3.2.4 the field
  // is the same at every level, so this changes how much of the world is drawn
  // and not which world it is, which is not the kind of mismatch 6.4.3 is about.
  const size = DETAIL_LEVELS.includes(r["size"] as never)
    ? r["size"]
    : nearestDetail(r["size"]);
  return {
    version: 1,
    name: typeof r["name"] === "string" ? r["name"] : "Unnamed",
    ...readLocation(r),
    // "upp" is the field name this build used before the rename to UWP.
    uwp: typeof r["uwp"] === "string" ? r["uwp"] : typeof r["upp"] === "string" ? r["upp"] : "",
    narrative: typeof r["narrative"] === "string" ? r["narrative"] : "",
    ...readSettings(r),
    seed: r["seed"],
    size,
    // A save written before POIs existed has none, which is the same planet as
    // one nobody has annotated. Spec 6.5.5.
    pois: parsePois(r["pois"]),
  };
}

/**
 * The world settings of 6.15. A save written before they existed has none, and a
 * planet with none is one nobody has overruled, so the absent case and the
 * unchanged case are the same case and neither needs a version of its own.
 */
function readSettings(r: Record<string, unknown>): {
  tiltDeg: number | null;
  orbitAu: number | null;
  rotationHours: number | null;
} {
  const setting = (key: string) => {
    const value = r[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  return {
    tiltDeg: setting("tiltDeg"),
    orbitAu: setting("orbitAu"),
    rotationHours: setting("rotationHours"),
  };
}

/**
 * The two location fields. Saves written before the format was settled carried a
 * single free text "location", which is split rather than dropped, so an old file
 * keeps whatever the user had written in it. Spec 6.14.4.
 */
function readLocation(r: Record<string, unknown>): { sector: string; hex: string } {
  if (typeof r["sector"] === "string" || typeof r["hex"] === "string") {
    return {
      sector: typeof r["sector"] === "string" ? r["sector"] : "",
      hex: typeof r["hex"] === "string" ? r["hex"] : "",
    };
  }
  if (typeof r["location"] === "string") return splitLegacyLocation(r["location"]);
  return { sector: "", hex: "" };
}

/** The eight positions of a UWP, as numbers. Spec 6.7.1. */
export interface Uwp {
  starport: string;
  size: number;
  atmosphere: number;
  hydrographics: number;
  population: number;
  government: number;
  law: number;
  tech: number;
}

const UWP_PATTERN = /^([A-EX])([0-9A-Z])([0-9A-Z])([0-9A-Z])([0-9A-Z])([0-9A-Z])([0-9A-Z])-([0-9A-Z])$/;

/**
 * Reads the digits back off a UWP string, or null if it is not one. The field is
 * free text the user can type into, so anything downstream of it has to cope with
 * half-finished input rather than assume eight good positions.
 */
export function parseUwp(uwp: string): Uwp | null {
  const match = UWP_PATTERN.exec(uwp.trim().toUpperCase());
  if (!match) return null;
  const digit = (i: number) => parseInt(match[i]!, 36);
  return {
    starport: match[1]!,
    size: digit(2),
    atmosphere: digit(3),
    hydrographics: digit(4),
    population: digit(5),
    government: digit(6),
    law: digit(7),
    tech: digit(8),
  };
}
