import {
  BARE_FROM,
  BARE_TO,
  clamp01,
  coverAt,
  ramp,
  snowAt,
  temperatureAt,
  type BiomeWorld,
} from "../gen/biome";
import { mix, normalise, parseRgb, rgbText, sample, type Shader, type Stop } from "./colour";

/**
 * The world as an eye in orbit would see it. Spec 5.7.1.2.
 *
 * The height ramp of 5.1 is a map: it says how high the ground is and it says so
 * with colour, which is why its greys and whites climb with altitude whatever the
 * world is made of. This says something else. It answers one question - what
 * colour is that ground - and every one of its ramps is read against temperature
 * rather than against height.
 *
 * What the ground is, it does not decide. That is the model of 5.8, which lives
 * in gen/biome.ts with the rest of what a world is made of, and this file is the
 * paint over it: cover, weathering, snow and the local temperature come from
 * there, and what is here is the colours they are drawn in and nothing else.
 *
 * Three things decide those colours, and the profile speaks to all three.
 *
 * Where it is warm and wet enough for cover, the ground is green, and greener or
 * darker by the temperature it grows at.
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

/**
 * How completely ice covers what is under it. Far more than the map's 5.4.5,
 * because the map is pale-washing terrain that still has to be read as terrain and
 * this is drawing a sheet of ice.
 */
const ICE_COVER = 0.94;

/* The view ----------------------------------------------------------------- */

/** The orbital view, as the shader the panels take. Spec 5.7.1.2. */
export function orbitalShader(seaLevel: number, world: BiomeWorld): Shader {
  return (height, sinLat, iced) => rgbText(orbitalColour(height, sinLat, iced, seaLevel, world));
}

export function orbitalColour(
  height: number,
  sinLat: number,
  iced: boolean,
  seaLevel: number,
  world: BiomeWorld,
): readonly number[] {
  const n = clamp01(normalise(height, seaLevel));
  const tempK = temperatureAt(world, sinLat);

  if (n <= 0.5) return iced ? mix(sample(OCEAN, n), ICE, ICE_COVER) : sample(OCEAN, n);

  const bare = mix(sample(ROCK, tempK), sample(DESERT, tempK), world.weathering);
  let ground = mix(bare, sample(VEGETATION, tempK), coverAt(world, sinLat, tempK));

  // Above the treeline the soil goes and the rock under it shows, on any world.
  ground = mix(ground, HIGHLAND, ramp(n, BARE_FROM, BARE_TO));

  // Snow, from the line the local temperature puts it at down to nothing a short
  // way under it, so the white comes in as a shoulder rather than as a step.
  ground = mix(ground, ICE, snowAt(world, tempK, n));

  return iced ? mix(ground, ICE, ICE_COVER) : ground;
}

/* Built ground ------------------------------------------------------------- */

/**
 * Where people have built, drawn over the ground rather than into it. Spec 5.9.
 *
 * Only the local panel does this, and only because of its scale. A hex of the map
 * is a couple of hundred kilometres across and some sixty thousand square
 * kilometres of ground; the largest built-up area on Earth is an eighth of that,
 * so a hex holding a city is still overwhelmingly whatever the biome says it is,
 * and painting it grey would be the distortion rather than the correction. That is
 * the same reason 5.5.3 draws a point of interest as an outline and not a fill.
 *
 * The local panel is the case that does not hold. Its hexes are sixteen to
 * twenty-seven kilometres across, a couple of hundred square kilometres each, and
 * a city of any size covers dozens of them. There the built ground is the ground.
 *
 * It is drawn in both views. A city is not a height and the terrain ramp is a
 * height map, which was the argument for leaving it out of that one; but the
 * ramp is what the panel is drawing the ground with either way, and a referee
 * looking at the patch wants to know where the town is whichever way they have it
 * coloured. The tint lifts out of the ramp's greens and ochres as readily as out
 * of the biome's.
 */

/**
 * People to the square kilometre of built-up area. Earth's dense cities run
 * between two and ten thousand; the higher end is taken, since a world building
 * upwards holds more of them on the same footprint than one that is not.
 */
const URBAN_DENSITY = 8000;

/**
 * What built ground reads as from above: the pale warm grey of roof, road and
 * concrete. Lighter than anything growing as well as far less saturated, which is
 * what makes a city read as one from orbit. A darker grey was tried first and
 * came out as a patch of the same weight as the forest around it - a change of
 * colour nobody could see, which is the same as no change at all.
 */
const URBAN: readonly [number, number, number] = [152, 145, 136];

/** How completely it covers the ground at the middle of a city. Not wholly: parks,
 *  water and the ground between buildings are still there to be seen. */
const URBAN_COVER = 0.78;

/** The fraction of the radius the built ground holds at full strength before it
 *  starts thinning into suburb, ribbon and then open country. */
const URBAN_CORE = 0.45;

/** How far a settlement of this many people is built out, in kilometres. */
export function builtRadiusKm(people: number): number {
  if (people <= 0) return 0;
  return Math.sqrt(people / URBAN_DENSITY / Math.PI);
}

/**
 * How built up a place is, from its distance to a settlement and that
 * settlement's reach. One at the middle, nothing at the edge, and a shoulder
 * between so a city does not end at a line.
 */
export function builtAt(distanceKm: number, radiusKm: number): number {
  if (radiusKm <= 0 || distanceKm >= radiusKm) return 0;
  const t = (radiusKm - distanceKm) / (radiusKm * (1 - URBAN_CORE));
  return t >= 1 ? 1 : t * t * (3 - 2 * t);
}

/** A ground colour with however much of it is built on. */
export function urbanise(colour: string, built: number): string {
  if (built <= 0) return colour;
  const amount = built > 1 ? 1 : built;
  return rgbText(mix(parseRgb(colour), URBAN, amount * URBAN_COVER));
}
