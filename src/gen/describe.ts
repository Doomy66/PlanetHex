import { parseUwp } from "../planet";
import { compactNumber, type PlanetDetail } from "./detail";
import { isRetrograde, isTidallyLocked } from "./climate";

/**
 * Prose read off the UWP. Spec 6.13.
 *
 * The tables below are the plain meanings of each position, from the cheatsheet
 * in section 7. Nothing here rolls anything or feeds back into generation: the
 * description is a view of the digits the user already has, rebuilt whenever they
 * edit one, so it is never stored and never in a save.
 */

const STARPORT: Record<string, string> = {
  A: "an excellent starport",
  B: "a good starport",
  C: "a routine starport",
  D: "a poor starport",
  E: "a frontier landing strip",
  X: "no starport",
};

const ATMOSPHERE = [
  "no atmosphere",
  "a trace atmosphere",
  "a very thin, tainted atmosphere",
  "a very thin atmosphere",
  "a thin, tainted atmosphere",
  "a thin atmosphere",
  "a standard atmosphere",
  "a standard but tainted atmosphere",
  "a dense atmosphere",
  "a dense, tainted atmosphere",
  "an exotic atmosphere",
  "a corrosive atmosphere",
  "an insidious atmosphere",
  "a very dense atmosphere",
  "a low-pressure atmosphere",
  "an unusual atmosphere",
];

const GOVERNMENT = [
  "no government",
  "a corporate administration",
  "a participating democracy",
  "a self-perpetuating oligarchy",
  "a representative democracy",
  "a feudal technocracy",
  "a captive government answering elsewhere",
  "no single government, the world being balkanised",
  "a civil service bureaucracy",
  "an impersonal bureaucracy",
  "a charismatic dictator",
  "a non-charismatic leader",
  "a charismatic oligarchy",
  "a religious dictatorship",
  "a religious autocracy",
  "a totalitarian oligarchy",
];

const LAW = [
  "no restrictions on what a visitor may carry",
  "only the worst weapons outlawed",
  "energy and laser weapons outlawed",
  "military weapons outlawed",
  "light assault weapons outlawed",
  "concealable weapons outlawed",
  "all firearms but shotguns and stunners outlawed",
  "shotguns outlawed",
  "blades and stunners outlawed",
  "all weapons outlawed",
];

const at = (table: readonly string[], i: number): string | null => table[i] ?? null;

/**
 * A sentence or three describing the world. Returns null when the UWP cannot be
 * read, so the caller can say so rather than print a description full of gaps.
 */
/** A day in whichever unit makes it readable, and whether it is a day at all. */
function dayLength(detail: PlanetDetail): string {
  if (isTidallyLocked(detail.rotationHours, detail.orbitAu)) {
    return "one face always to its sun";
  }
  const hours = detail.rotationHours;
  return hours < 72
    ? `a day of ${hours.toFixed(0)} hours`
    : `a day of ${(hours / 24).toFixed(0)} of Earth's`;
}

export function describeUwp(uwp: string, detail: PlanetDetail): string | null {
  const p = parseUwp(uwp);
  if (p === null) return null;

  const physical: string[] = [];
  if (detail.diameterKm !== null) physical.push(`${km(detail.diameterKm)} across`);
  if (detail.gravityG !== null) physical.push(`${detail.gravityG.toFixed(2)}g at the surface`);

  const air = at(ATMOSPHERE, p.atmosphere) ?? "an atmosphere off the scale";
  const pressure =
    p.atmosphere === 0 || detail.pressureAtm === null
      ? ""
      : ` at ${detail.pressureAtm.toFixed(2)} atmospheres`;
  const water =
    detail.hydrographicsPct === null
      ? ""
      : ` and ${detail.hydrographicsPct.toFixed(0)}% surface water`;

  const sentences = [
    `A world ${join(physical)}, with ${air}${pressure}${water}, ` +
      `tilted ${detail.axialTiltDeg.toFixed(0)}° on its axis${
        isRetrograde(detail.axialTiltDeg) ? " and turning backwards" : ""
      }.`,
    // The world settings of 6.15. Read in the order they were worked out in, which
    // is also the order they make sense in: where it is, how warm that leaves it,
    // and how long its day runs.
    `It sits ${detail.orbitAu.toFixed(2)} AU out at a mean ${(detail.meanTempK - 273.15).toFixed(0)}°C, ` +
      `with ${dayLength(detail)}.`,
  ];

  if (detail.population !== null && detail.population < 1) {
    sentences.push("Nobody lives there.");
  } else {
    const people = detail.population === null ? "an unrecorded population" : count(detail.population);
    const rule = at(GOVERNMENT, p.government) ?? "an unrecorded government";
    sentences.push(
      `It holds ${people} under ${rule}, at law level ${digit(p.law)}, ` +
        `with ${at(LAW, p.law) ?? "restrictions off the scale"}.`,
    );
  }

  sentences.push(
    `It has ${STARPORT[p.starport] ?? "no starport"} and sits at tech level ${digit(p.tech)}.`,
  );
  return sentences.join(" ");
}

const km = (value: number): string => `${value.toLocaleString("en-GB")}km`;

/** Population as prose rather than a bare figure, which reads badly in billions. */
function count(value: number): string {
  return `${compactNumber(value)} people`;
}

/** Joins a list into prose: "a", "a and b", "a, b and c". */
function join(parts: string[]): string {
  if (parts.length === 0) return "of unrecorded size";
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Back to the hex digit the user typed, so the prose matches the field. */
function digit(value: number): string {
  return value.toString(36).toUpperCase();
}

/** One position of the UWP, its digit, and what that digit means. Spec 6.19.2. */
export interface UwpPosition {
  readonly label: string;
  readonly digit: string;
  readonly meaning: string;
}

/**
 * The eight positions read out one at a time, for the world sheet of 6.19.
 *
 * The prose of describeUwp reads the profile as a paragraph, which is how a
 * referee wants it at the table. A sheet somebody is going to print wants the
 * same knowledge as a column they can run a finger down, and wants it to line up
 * with the digits in the field above. So the same tables are read again, one
 * position at a time, and the positions that stand for a figure rather than a
 * word take the figure the panel already worked out.
 */
export function uwpBreakdown(uwp: string, detail: PlanetDetail): UwpPosition[] | null {
  const p = parseUwp(uwp);
  if (p === null) return null;
  const figure = (value: number | null, format: (v: number) => string): string =>
    value === null ? "not worked out" : format(value);
  return [
    { label: "Starport", digit: p.starport, meaning: STARPORT[p.starport] ?? "no starport" },
    {
      label: "Size",
      digit: digit(p.size),
      meaning: figure(detail.diameterKm, (v) => `${km(v)} across, ${
        detail.gravityG === null ? "unknown gravity" : `${detail.gravityG.toFixed(2)}g`
      }`),
    },
    {
      label: "Atmosphere",
      digit: digit(p.atmosphere),
      meaning:
        (at(ATMOSPHERE, p.atmosphere) ?? "an atmosphere off the scale") +
        (p.atmosphere === 0 || detail.pressureAtm === null
          ? ""
          : `, ${detail.pressureAtm.toFixed(2)} atmospheres`),
    },
    {
      label: "Hydrographics",
      digit: digit(p.hydrographics),
      meaning: figure(detail.hydrographicsPct, (v) => `${v.toFixed(0)}% of the surface under water`),
    },
    {
      label: "Population",
      digit: digit(p.population),
      meaning:
        detail.population === null
          ? "an unrecorded population"
          : detail.population < 1
            ? "nobody lives there"
            : count(detail.population),
    },
    {
      label: "Government",
      digit: digit(p.government),
      meaning: at(GOVERNMENT, p.government) ?? "an unrecorded government",
    },
    {
      label: "Law level",
      digit: digit(p.law),
      meaning: at(LAW, p.law) ?? "restrictions off the scale",
    },
    { label: "Tech level", digit: digit(p.tech), meaning: `tech level ${digit(p.tech)}` },
  ];
}
