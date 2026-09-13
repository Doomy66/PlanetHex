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
import { mix, normalise, rgbText, sample, type Shader, type Stop } from "./colour";

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
