import { latitudeContrastK, seasonalTiltDeg, temperatureAtLatitude } from "../gen/climate";
import { coverFactorsFor, warmthAt } from "../gen/life";
import { mix, normalise, rgbText, sample, type Shader, type Stop } from "./colour";
import type { PlanetDetail } from "../gen/detail";

/**
 * The world as it would look to an eye in orbit. Spec 5.7.
 *
 * The height ramp of 5.1 is a map: it says how high the ground is and it says so
 * with colour, which is why its greys and whites climb with altitude whatever the
 * world is made of. This says something else. It answers one question - what
 * colour is that ground - and every one of its ramps is read against temperature
 * rather than against height.
 *
 * Three things decide it, and the profile speaks to all three.
 *
 * Where it is warm and wet enough for cover, the ground is green. That is the
 * verdancy of 5.6 again, but taken a place at a time rather than once for the
 * world: a world whose mean is temperate is a jungle at its equator and a tundra
 * at sixty degrees, and one colour for the whole planet cannot say that. So the
 * warmth factor is read at the local temperature, which is what the latitude model
 * of 5.7.3 is for, and it is the axial tilt that decides how far apart those
 * temperatures are.
 *
 * Where there is not, the ground is bare, and bare comes in two colours. Dust,
 * sand and iron are what a surface turns when air and water have been working on
 * it, and that is the brown of a desert. A world with neither keeps the colour of
 * its own rock, and that is grey. So the bare ground is a blend, and what sets it
 * is not life but weather.
 *
 * And water is white when it is frozen. The caps of 5.4 read as ice rather than as
 * pale ground here, and the snow line comes down the mountains as the latitude
 * cools, which is the one place this view still reads height.
 */

/* Ramps -------------------------------------------------------------------- */

/**
 * Open water. Deeper than the map's sea, because the map is drawing a sea to be
 * read over and this is drawing one to be looked at, and the ocean seen from
 * orbit is nearly black away from its shelves.
 */
const OCEAN: readonly Stop[] = [
  [0.0, [7, 24, 48]],
  [0.32, [13, 46, 84]],
  [0.46, [30, 86, 128]],
  [0.5, [58, 126, 158]],
];

/**
 * Ground cover, by the temperature it grows at. Cold cover is sparse and grey-
 * green over the stone it sits on; temperate cover is the green of grass and
 * broadleaf; the tropics are darker and more saturated than either, which is what
 * a rainforest looks like from above and what people consistently get wrong.
 */
const VEGETATION: readonly Stop[] = [
  [250, [92, 100, 80]],
  [270, [74, 102, 62]],
  [288, [80, 118, 56]],
  [302, [48, 98, 46]],
  [318, [36, 80, 42]],
];

/**
 * Weathered ground with nothing growing on it. Cold deserts are pale: frost-
 * shattered dust with no iron chemistry to speak of. Warm ones are sand. Hot ones
 * are the oxidised red of Australia, the Namib and Mars.
 */
const DESERT: readonly Stop[] = [
  [245, [154, 148, 136]],
  [275, [174, 154, 118]],
  [302, [190, 156, 100]],
  [335, [170, 112, 74]],
];

/**
 * Unweathered rock: a world with no air and no water has nothing to change the
 * colour of its own stone, so it keeps it. Luna and Mercury are this, and they are
 * darker and browner than the white their photographs suggest.
 */
const ROCK: readonly Stop[] = [
  [250, [120, 121, 124]],
  [300, [116, 111, 108]],
  [340, [104, 96, 90]],
];

/** Stripped high ground: scree and exposed stone, above where soil holds. */
const HIGHLAND: readonly [number, number, number] = [132, 127, 121];

/** Snow and ice. Frozen water is white, whatever it is lying on. Spec 5.7.5. */
const ICE: readonly [number, number, number] = [246, 249, 252];

/* Constants ---------------------------------------------------------------- */

/**
 * How completely ice covers what is under it. Far more than the map's 5.4.5,
 * because the map is pale-washing terrain that still has to be read as terrain and
 * this is drawing a sheet of ice.
 */
const ICE_COVER = 0.94;

/** Normalised heights between which soil gives out and the rock comes through. */
const BARE_FROM = 0.8;
const BARE_TO = 0.93;

/**
 * The local mean temperatures between which the snow line climbs from the coast
 * to the highest peaks. At the cold end the ground is white from the water's edge
 * up; at the warm end only the summits hold any.
 *
 * It is permanent snow this is placing, not snow that falls, so both ends sit well
 * away from freezing. Earth's line runs about 5,000m at the equator, 2,700m at 45
 * degrees and down to the shore past 70, and these put it there.
 */
const SNOW_TO_THE_COAST_K = 258;
const SNOW_ON_NOTHING_K = 300;

/** How wide a band the snow line is drawn as, in normalised height. */
const SNOW_BAND = 0.07;

/**
 * Surface water, as a percentage, between which a world goes from having nothing
 * to fall as snow to having enough to whiten everything cold enough for it. A
 * hydrographics digit of 0 is a trace rather than none, and a trace is a long way
 * short of a snowfield: a world with that much water reads as the rock it is.
 */
const SNOW_FROM_PCT = 3;
const SNOW_FULL_PCT = 20;

/**
 * The dry belts, in degrees from the equator, and how wide and how deep they cut.
 *
 * Air rising over the equator comes down again about this far north and south of
 * it, and it comes down having already rained. The Sahara, Arabia, the Kalahari,
 * the Thar, the Atacama and the Australian interior are one band and the same
 * band, and a world drawn without them has an unbroken green waist that no planet
 * has. It needs air to happen, so it is scaled by how much of it there is.
 */
const DRY_BELT_DEG = 26;
const DRY_BELT_WIDTH_DEG = 12;
const DRY_BELT_DEPTH = 0.62;

/**
 * What it takes for the ground to count as weathered rather than as bare stone.
 *
 * Air is the low bar. A trace of it is enough: Mars holds six thousandths of an
 * atmosphere and is the reddest surface in the solar system, because given four
 * billion years that is all the oxidation needs. It takes a true vacuum to leave
 * stone as stone, which is why Luna and Mercury are grey.
 *
 * Water is the higher one, and it is a hydrosphere that is wanted rather than a
 * trace. A hydrographics digit of 0 still allows a few percent, and a few percent
 * of frost on an airless rock leaves it an airless rock.
 */
const WEATHERED_ATM = 0.004;
const WEATHERED_FROM_PCT = 5;
const WEATHERED_FULL_PCT = 25;

/** What a world with no readable profile is drawn as: middling, not lush. */
const DEFAULT_AIR = 0.7;
const DEFAULT_WATER = 0.7;

/* The model ---------------------------------------------------------------- */

/** Everything about the world the visible view needs. The rest is per place. */
export interface VisibleWorld {
  readonly meanTempK: number;
  /** How much colder the poles run than the equator, in kelvin. Spec 5.7.3. */
  readonly contrastK: number;
  readonly air: number;
  readonly water: number;
  /** How far air and water have worked the surface over, 0 for bare stone. */
  readonly weathering: number;
  /** Whether there is water to fall as snow. */
  readonly snow: number;
}

export function visibleWorldFor(uwp: string, detail: PlanetDetail): VisibleWorld {
  const cover = coverFactorsFor(uwp, detail);
  const pressure = detail.pressureAtm ?? 0;
  const wet = detail.hydrographicsPct ?? 0;
  return {
    meanTempK: detail.meanTempK,
    contrastK: latitudeContrastK(seasonalTiltDeg(detail.axialTiltDeg), pressure),
    air: cover?.air ?? DEFAULT_AIR,
    water: cover?.water ?? DEFAULT_WATER,
    weathering: Math.max(
      ramp(pressure, 0, WEATHERED_ATM),
      ramp(wet, WEATHERED_FROM_PCT, WEATHERED_FULL_PCT),
    ),
    snow: ramp(wet, SNOW_FROM_PCT, SNOW_FULL_PCT),
  };
}

/** The visible view, as the shader the panels take. Spec 5.7. */
export function visibleShader(seaLevel: number, world: VisibleWorld): Shader {
  return (height, sinLat, iced) => rgbText(visibleColour(height, sinLat, iced, seaLevel, world));
}

export function visibleColour(
  height: number,
  sinLat: number,
  iced: boolean,
  seaLevel: number,
  world: VisibleWorld,
): readonly number[] {
  const n = clamp01(normalise(height, seaLevel));
  const tempK = temperatureAtLatitude(world.meanTempK, world.contrastK, sinLat);

  if (n <= 0.5) return iced ? mix(sample(OCEAN, n), ICE, ICE_COVER) : sample(OCEAN, n);

  // Cover, the way 5.6 builds it, but with the warmth read here rather than at the
  // world's mean and with the dry belts of 5.7.4 taken out of it.
  const cover = world.air * world.water * warmthAt(tempK) * dryBelt(sinLat, world.air);
  const bare = mix(sample(ROCK, tempK), sample(DESERT, tempK), world.weathering);
  let ground = mix(bare, sample(VEGETATION, tempK), cover);

  // Above the treeline the soil goes and the rock under it shows, on any world.
  ground = mix(ground, HIGHLAND, ramp(n, BARE_FROM, BARE_TO));

  // Snow, from the line the local temperature puts it at down to nothing a short
  // way under it, so the white comes in as a shoulder rather than as a step.
  const line = 0.5 + 0.5 * ramp(tempK, SNOW_TO_THE_COAST_K, SNOW_ON_NOTHING_K);
  const snow = world.snow * ramp(n, line - SNOW_BAND, line);
  ground = mix(ground, ICE, snow);

  return iced ? mix(ground, ICE, ICE_COVER) : ground;
}

/**
 * What the subtropical dry belts leave of the ground cover at a latitude. One at
 * the equator and in the temperate belts, less in the two bands either side of the
 * equator where the air comes back down.
 */
function dryBelt(sinLat: number, air: number): number {
  const latDeg = (Math.asin(clamp(sinLat, -1, 1)) * 180) / Math.PI;
  const off = (Math.abs(latDeg) - DRY_BELT_DEG) / DRY_BELT_WIDTH_DEG;
  return 1 - DRY_BELT_DEPTH * air * Math.exp(-off * off);
}

/** Zero at the `none` end, one at the `full` end, linear between. Either order. */
function ramp(value: number, none: number, full: number): number {
  if (none === full) return value >= full ? 1 : 0;
  return clamp01((value - none) / (full - none));
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
