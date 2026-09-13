import { cloudFractionFor } from "./climate";
import { valueFor } from "./rng";
import type { PlanetDetail } from "./detail";
import type { Vec3 } from "../grid/vec3";

/**
 * The sky a world is under. Spec 5.10.
 *
 * How much cloud there is, the application already knew: it is the figure the
 * albedo of 6.15 is built on, water to lift and air to lift it into, and reading
 * it off the same number is what stops the globe showing an overcast world that
 * the temperature model has been treating as clear.
 *
 * Where the cloud is, is the circulation of 5.7.2.2 seen from the other side. Air
 * rises over the equator and rains, which is the band of storms along it; it comes
 * down again about twenty-six degrees out, dry, which is both the deserts of that
 * clause and the clear belts either side of the waist; and it rises again along the
 * front where the cold air from the pole meets it, which is why the fifties are
 * the cloudiest latitudes on Earth. One model, two things drawn from it, and a
 * world's deserts sit under its clear skies by construction rather than by luck.
 *
 * The rest is noise, because weather is. Nothing here is a simulation: it is a
 * still, a plausible afternoon on a world, fixed by the seed so that the same
 * world is under the same sky every time it is opened.
 */

/* The bands ---------------------------------------------------------------- */

/** What the sky is worth away from any of the three bands below. */
const BASE = 0.55;

/**
 * The three latitude bands, in degrees from the equator: how far out each sits,
 * how wide it runs, and how much sky it adds or takes away.
 */
const ITCZ = { at: 0, width: 12, gain: 0.5 };
const HORSE = { at: 26, width: 12, gain: -0.45 };
const STORM = { at: 55, width: 16, gain: 0.35 };

/* The noise ---------------------------------------------------------------- */

/**
 * How large the weather is. A little over two cycles around the world at the
 * coarsest octave, which puts the biggest systems at a few thousand kilometres -
 * about the size of a real one.
 */
const BASE_FREQUENCY = 2.6;
const OCTAVES = 4;
const LACUNARITY = 2.1;
const GAIN = 0.5;

/**
 * How much of the way from the bar to the top of the range cloud takes to reach
 * its full thickness.
 *
 * Wide, and that is what gives a sky structure rather than a shape. Narrow, the
 * thickness saturates a hair above the bar and every cloud on the world is the
 * same flat white with a hard rim; wide, only the cores are solid and the rest is
 * a gradient, which is what cloud looks like from above.
 */
const FEATHER = 0.5;

/**
 * Where the noise above actually lands, measured over forty thousand points of
 * the sphere: it is a sum of four smoothed uniforms, so it piles up around its
 * middle and reaches neither end. Nine tenths of it falls between 0.34 and 0.70.
 *
 * That matters because the cover of 5.10.2 is a fraction of the world, and it can
 * only be one if the number it is compared against is spread evenly over its
 * range. Read raw, a cover of three quarters put the bar at 0.25 and cleared every
 * sample on the planet: a world drawn under solid overcast whatever its profile
 * said. So the noise is put through its own distribution first, and what comes out
 * is flat between 0 and 1.
 */
const NOISE_MEAN = 0.524;
const NOISE_SPREAD = 0.108;

export interface CloudWorld {
  readonly seed: string;
  /** How much of the world is under cloud, 0 to 1. */
  readonly cover: number;
}

export function cloudWorldFor(seed: string, detail: PlanetDetail): CloudWorld {
  return {
    seed: `${seed}:cloud`,
    cover: cloudFractionFor(detail.hydrographicsPct ?? 0, detail.pressureAtm ?? 0),
  };
}

/** How much sky the three bands leave at a latitude, 0 to about 1.4. */
export function bandAt(sinLat: number): number {
  const latDeg = (Math.asin(clamp(sinLat, -1, 1)) * 180) / Math.PI;
  const gaussian = (band: typeof ITCZ) => {
    const off = (Math.abs(latDeg) - band.at) / band.width;
    return band.gain * Math.exp(-off * off);
  };
  return Math.max(0, BASE + gaussian(ITCZ) + gaussian(HORSE) + gaussian(STORM));
}

/**
 * How thick the cloud is over a point of the unit sphere, 0 for clear sky and 1
 * for solid overcast.
 */
export function cloudAt(world: CloudWorld, p: Vec3): number {
  if (world.cover <= 0) return 0;
  const wanted = clamp01(world.cover * bandAt(p[1]));
  if (wanted <= 0) return 0;
  // The more sky is wanted, the lower the bar the weather has to clear to be cloud.
  const over = clamp01((flatten(fbm(world.seed, p)) - (1 - wanted)) / FEATHER);
  return smooth(over);
}

/**
 * The noise, spread evenly over 0 to 1. The normal distribution's own cumulative
 * curve, by the tanh approximation to it, which is close enough for weather and
 * costs one hyperbolic where the exact form costs a series.
 */
function flatten(value: number): number {
  const z = (value - NOISE_MEAN) / NOISE_SPREAD;
  return 0.5 * (1 + Math.tanh(0.7978845608 * (z + 0.044715 * z * z * z)));
}

/* Value noise on the sphere ------------------------------------------------ */

function fbm(seed: string, p: Vec3): number {
  let frequency = BASE_FREQUENCY;
  let amplitude = 1;
  let total = 0;
  let range = 0;
  for (let octave = 0; octave < OCTAVES; octave++) {
    total += amplitude * noiseAt(seed, p[0] * frequency, p[1] * frequency, p[2] * frequency);
    range += amplitude;
    frequency *= LACUNARITY;
    amplitude *= GAIN;
  }
  return total / range;
}

/**
 * Value noise: a number at every point of the integer lattice, read between them.
 *
 * Sampled in three dimensions on a direction rather than in two on a latitude and
 * a longitude, which is what keeps the poles from being a seam. A sphere passing
 * through a three-dimensional field meets no edge anywhere on it.
 */
function noiseAt(seed: string, x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const zf = smooth(z - zi);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const edge = (dy: number, dz: number) =>
    lerp(corner(seed, xi, yi + dy, zi + dz), corner(seed, xi + 1, yi + dy, zi + dz), xf);
  const face = (dz: number) => lerp(edge(0, dz), edge(1, dz), yf);
  return lerp(face(0), face(1), zf);
}

/** The value at one lattice point, fixed by the seed and by nothing else. */
function corner(seed: string, x: number, y: number, z: number): number {
  const hash =
    (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
  return valueFor(seed, hash);
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
