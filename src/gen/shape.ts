import type { HeightFieldOptions } from "./field";
import { DEFAULT_FIELD_OPTIONS } from "./field";
import type { PlanetDetail } from "./detail";
import { parseUwp } from "../planet";

/**
 * How the UWP shapes the terrain. Spec 3.4.
 *
 * The seed decides where the continents are. The UWP decides what kind of surface
 * they sit on, by setting the two knobs the height field exposes.
 *
 * Gravity sets the relief. A heavy world cannot hold up tall ground, so its
 * terrain is subdued; a light one keeps mountains far larger in proportion, which
 * is why the tallest peaks in the solar system are on small bodies.
 *
 * Air and water set how much fine detail survives. Both erode, so a thick wet
 * world comes out weathered and rounded, and an airless dry one keeps its edges.
 * How hard the air bites depends on what it is made of as well as how much of it
 * there is: a corrosive atmosphere attacks rock that a standard one at the same
 * pressure would barely touch. How hard it blows depends on how fast the world
 * turns, since the winds that carry weather are driven by the spin.
 *
 * What the water does depends on what state it is in, which is the temperature's
 * business rather than the hydrographics digit's. A hydrographics figure counts
 * surface water without saying whether it flows: an ocean frozen to the bottom
 * erodes nothing, and one boiled off erodes nothing either. Between those, the
 * rate rises with temperature, since silicate weathering does. Ice is not nothing
 * though - a glacier is a more efficient tool than a river, and a world cold
 * enough to be glaciated but warm enough for the ice to move is worn down hard.
 *
 * Continent spread is left to the seed. It is the one thing here that is a matter
 * of which world this is rather than what kind of world it is.
 */

/** Relief at the lightest and heaviest worlds the size digit allows. */
const RELIEF = { light: 0.45, heavy: 0.2 } as const;
const MAX_GRAVITY = 1.4;

/** Fine detail kept on an unweathered world, and on a thoroughly weathered one. */
const DETAIL_KEPT = { bare: 0.74, eroded: 0.55 } as const;

/**
 * Pressure at which erosion by air is counted as full strength. Set where the
 * cheatsheet's very dense band begins rather than at a standard atmosphere, so a
 * dense world is not already at the ceiling. If it saturated at one atmosphere,
 * every thick world would weather identically and the chemistry below could never
 * show.
 */
const EROSIVE_PRESSURE = 2.5;

/**
 * How hard each atmosphere type bites, as a multiple of a standard atmosphere at
 * the same pressure. Spec 3.4.3.1.
 *
 * Only the chemistry counts. The tainted types differ from their clean partners in
 * what they do to lungs, not to rock, so they weather the same. Exotic is unusual
 * rather than aggressive and is left at one, since the cheatsheet says nothing that
 * would justify more.
 */
const AGGRESSION: Record<number, number> = {
  11: 2.5, // B, corrosive
  12: 3, // C, insidious
};

/** The multiplier for an atmosphere digit, one where nothing marks it out. */
export function aggressionFor(atmosphere: number): number {
  return AGGRESSION[atmosphere] ?? 1;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Reads a piecewise linear curve given as ascending [x, y] pairs. */
function curve(points: readonly (readonly [number, number])[], x: number): number {
  const first = points[0]!;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    if (x <= x1) return lerp(y0, y1, (x - x0) / (x1 - x0));
  }
  return points[points.length - 1]![1];
}

/**
 * How much work the world's water is doing on its rock, from 0 to 1, against the
 * mean surface temperature in kelvin.
 *
 * Below 150K ice is too cold and stiff to flow and nothing happens. From there to
 * freezing it is glacial: slower than a river at first, then as fast, since a
 * temperate glacier is the more efficient tool of the two. Through the liquid band
 * it is at full strength. Past that the water is leaving, and by 400K there is
 * none left on the surface to do anything with.
 */
const WATER_ACTIVITY: readonly (readonly [number, number])[] = [
  [150, 0],
  [240, 0.45],
  [273, 1],
  [330, 1],
  [400, 0],
];

export function waterActivity(meanTempK: number): number {
  return clamp01(curve(WATER_ACTIVITY, meanTempK));
}

/**
 * How hard the wind blows, as a multiple of what a world turning once a day gets.
 * Spin drives the circulation, so a fast rotator is windier and a world with its
 * day locked to its year barely stirs. Mild, and logarithmic: the range from a
 * six hour day to a locked one is three orders of magnitude and the effect on rock
 * is nothing like that large.
 */
const WIND_PER_DECADE = 0.3;
const WIND_LIMITS = { still: 0.6, gale: 1.4 } as const;
const REFERENCE_DAY_HOURS = 24;

export function windFor(rotationHours: number): number {
  const decades = Math.log10(REFERENCE_DAY_HOURS / Math.max(0.1, rotationHours));
  return clamp(1 + WIND_PER_DECADE * decades, WIND_LIMITS.still, WIND_LIMITS.gale);
}

/**
 * How thoroughly the surface is weathered, from 0 for bare rock to 1. Air and
 * water count for as much as each other: either alone erodes, and a world with
 * both erodes fastest.
 */
export function erosion(detail: PlanetDetail, atmosphere: number): number {
  const bite = (detail.pressureAtm ?? 0) * aggressionFor(atmosphere) * windFor(detail.rotationHours);
  const air = clamp01(bite / EROSIVE_PRESSURE);
  const water = clamp01((detail.hydrographicsPct ?? 0) / 100) * waterActivity(detail.meanTempK);
  return (air + water) / 2;
}

export function fieldOptionsFor(detail: PlanetDetail, uwp: string): HeightFieldOptions {
  const profile = parseUwp(uwp);
  if (profile === null || detail.gravityG === null || detail.pressureAtm === null) {
    return DEFAULT_FIELD_OPTIONS;
  }
  return {
    roughness: lerp(RELIEF.light, RELIEF.heavy, clamp01(detail.gravityG / MAX_GRAVITY)),
    persistence: lerp(DETAIL_KEPT.bare, DETAIL_KEPT.eroded, erosion(detail, profile.atmosphere)),
    seedSpread: DEFAULT_FIELD_OPTIONS.seedSpread,
  };
}
