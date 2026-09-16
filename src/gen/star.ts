/**
 * The stars of a system. SystemSpec section 2.
 *
 * A primary, and a companion for roughly one system in three. Nothing here
 * reads a world: SystemSpec 2.5 rolls the star in its own right and leaves it to
 * section 5 to put the world in the best orbit that star turns out to have.
 *
 * This is also the one part of a system the subsector chart needs for all eighty
 * of its hexes, under SystemSpec 11.2, so it is a function of the seed alone and
 * costs nothing but a few draws.
 */

import { valueFor } from "./rng";

/** Spectral class, hottest first. */
export type SpectralClass = "O" | "B" | "A" | "F" | "G" | "K" | "M";

/**
 * Luminosity class, brightest first: supergiants, bright and ordinary giants,
 * subgiants, the main sequence, subdwarfs, and white dwarfs.
 */
export type StarSize = "Ia" | "Ib" | "II" | "III" | "IV" | "V" | "VI" | "D";

export interface Star {
  readonly spectral: SpectralClass;
  /** The 0 to 9 subdivision of the class, so a star is G2 rather than a G. */
  readonly subclass: number;
  readonly size: StarSize;
  /** Output relative to the Sun, which is what every distance here is read against. */
  readonly luminosity: number;
}

export interface Stars {
  readonly primary: Star;
  /** Null for a single star, which is most of them. */
  readonly companion: Star | null;
  /**
   * Where the companion sits: inside every orbit a world could hold, or outside
   * all of them. SystemSpec 2.4 allows nothing in between, which is what lets
   * section 3 lay out one set of orbits rather than three.
   */
  readonly companionOrbit: "close" | "far" | null;
}

/**
 * How often each class comes up, out of a hundred.
 *
 * Leaning towards the real distribution and stopping short of it, which is
 * SystemSpec 2.2.1: three systems in four being an M dwarf is the truth and
 * makes a dull subsector, and a chart full of blue giants is a lie.
 */
const CLASS_WEIGHTS: Readonly<Record<SpectralClass, number>> = {
  M: 45,
  K: 22,
  G: 14,
  F: 9,
  A: 6,
  B: 3,
  O: 1,
};

/** How often each luminosity class comes up. The main sequence is most of it. */
const SIZE_WEIGHTS: Readonly<Record<StarSize, number>> = {
  V: 80,
  D: 8,
  VI: 4,
  IV: 4,
  III: 3,
  II: 0.6,
  Ib: 0.3,
  Ia: 0.1,
};

/**
 * Output of a main sequence star of each class, relative to the Sun.
 *
 * Rounded hard, because nothing downstream needs better: these figures set how
 * far out the habitable zone is, and that is read to one or two figures under
 * SystemSpec 3.4.1.
 */
const MAIN_SEQUENCE_LUMINOSITY: Readonly<Record<SpectralClass, number>> = {
  O: 30000,
  B: 1000,
  A: 20,
  F: 3,
  G: 1,
  K: 0.3,
  M: 0.02,
};

/**
 * What each luminosity class does to that figure. A giant is the same star
 * swollen and far brighter; a white dwarf is a cinder.
 *
 * A rough model and deliberately so. The real relation is two-dimensional and
 * this collapses it to a multiplier, which is enough for a habitable zone and
 * an orbit table and not enough for anything else. Nothing here is astronomy.
 */
const SIZE_FACTOR: Readonly<Record<StarSize, number>> = {
  Ia: 30000,
  Ib: 10000,
  II: 2000,
  III: 200,
  IV: 5,
  V: 1,
  VI: 0.3,
  D: 0.0005,
};

/** Luminosity is clamped here: the model has nothing to say past either end. */
const LUMINOSITY_LIMITS = { dim: 0.00005, bright: 1e6 } as const;

/**
 * The surface temperature of each class, in kelvin, near enough for what it is
 * used for. The Sun is a G at 5,772K, and the run from blue to red is the one
 * thing about a spectral class everybody already knows.
 */
const CLASS_TEMPERATURE_K: Readonly<Record<SpectralClass, number>> = {
  O: 40000,
  B: 20000,
  A: 8750,
  F: 6750,
  G: 5600,
  K: 4450,
  M: 3200,
};

const SUN_TEMPERATURE_K = 5772;
export const SUN_RADIUS_KM = 695_700;

/**
 * How big a star is, in km. SystemSpec 2.5.
 *
 * Not rolled: a star's brightness and its colour between them fix its size,
 * because brightness is area times how hard each piece of that area radiates,
 * and temperature says the second. So a red giant is vast and a white dwarf is
 * the size of a planet, and neither had to be decided separately from the class
 * and size already drawn.
 *
 * This is what a jump shadow is measured from, which is the only reason the
 * generator needs it: 4.8.
 */
export function radiusKm(star: Star): number {
  const temperature = CLASS_TEMPERATURE_K[star.spectral];
  const relative =
    Math.sqrt(star.luminosity) * Math.pow(SUN_TEMPERATURE_K / temperature, 2);
  // A white dwarf is a cinder the size of the Earth however the arithmetic
  // above lands: it is degenerate matter rather than a smaller version of the
  // star it was, and nothing in a spectral class knows that.
  const capped = star.size === "D" ? Math.min(relative, 0.02) : relative;
  return capped * SUN_RADIUS_KM;
}

/** The diameter, which is the figure a hundred of them is counted in. */
export function diameterKm(star: Star): number {
  return radiusKm(star) * 2;
}

/** One companion in how many systems. SystemSpec 2.3. */
const COMPANION_SHARE = 1 / 3;

/** Draws from the seed, by named stream, so nothing depends on call order. */
function pick<T extends string>(
  seed: string,
  stream: string,
  weights: Readonly<Record<T, number>>,
  index = 0,
): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let at = valueFor(`${seed}:star:${stream}`, index) * total;
  for (const [key, weight] of entries) {
    at -= weight;
    if (at < 0) return key;
  }
  return entries[entries.length - 1]![0];
}

export function luminosityOf(spectral: SpectralClass, size: StarSize): number {
  const raw = MAIN_SEQUENCE_LUMINOSITY[spectral] * SIZE_FACTOR[size];
  return Math.min(LUMINOSITY_LIMITS.bright, Math.max(LUMINOSITY_LIMITS.dim, raw));
}

function starAt(seed: string, stream: string, index: number): Star {
  const spectral = pick<SpectralClass>(seed, `${stream}-class`, CLASS_WEIGHTS, index);
  const size = pick<StarSize>(seed, `${stream}-size`, SIZE_WEIGHTS, index);
  // The subclass is the label's, not the model's: luminosity is by class, and a
  // G2 and a G7 are the same star to everything downstream. It is drawn anyway
  // because a chart of bare letters reads as a placeholder.
  const subclass = Math.floor(valueFor(`${seed}:star:${stream}-sub`, index) * 10);
  return { spectral, subclass, size, luminosity: luminosityOf(spectral, size) };
}

/**
 * The stars of one system, fixed by its seed.
 *
 * The companion is drawn until it is no brighter than the primary, which is
 * SystemSpec 2.3: the brighter of two stars is the primary by definition, and a
 * companion that outshone it would have the pair named the wrong way round. A
 * handful of attempts settles it, and where they do not the pair is a matched
 * one, which is 2.3.2.
 */
export function starsFor(seed: string): Stars {
  const primary = starAt(seed, "primary", 0);
  if (valueFor(`${seed}:star:companion`, 0) >= COMPANION_SHARE) {
    return { primary, companion: null, companionOrbit: null };
  }
  let companion = starAt(seed, "companion", 0);
  for (let attempt = 1; companion.luminosity > primary.luminosity && attempt < 8; attempt++) {
    companion = starAt(seed, "companion", attempt);
  }
  if (companion.luminosity > primary.luminosity) {
    // Every draw came up brighter, which is what happens when the primary is
    // already about as dim as a star gets. The pair is a matched one: the
    // companion takes the primary's own class and size, which is equal rather
    // than brighter and so still the right way round.
    companion = { ...primary, subclass: companion.subclass };
  }
  const close = valueFor(`${seed}:star:companion-where`, 0) < 0.5;
  return { primary, companion, companionOrbit: close ? "close" : "far" };
}

/**
 * What the orbits of a system are lit by, relative to the Sun.
 *
 * A close companion orbits inside every orbit a world could hold, under
 * SystemSpec 2.4, so a world out here sees two stars close together in its sky
 * and gets the light of both. A far companion is outside all of them and lights
 * nothing: it is a bright star in the night, not a second sun.
 *
 * This is what the habitable zone and every distance in system.ts are worked out
 * on, and what a world of this system carries away as its own star setting.
 */
export function systemLuminosity(stars: Stars): number {
  const companion =
    stars.companion !== null && stars.companionOrbit === "close" ? stars.companion.luminosity : 0;
  return stars.primary.luminosity + companion;
}

/** One star as a sector file writes it: class, subclass, then luminosity class. */
export function starLabel(star: Star): string {
  return star.size === "D" ? "D" : `${star.spectral}${star.subclass} ${star.size}`;
}

export const SPECTRAL_CLASSES: readonly SpectralClass[] = ["O", "B", "A", "F", "G", "K", "M"];
export const STAR_SIZES: readonly StarSize[] = ["Ia", "Ib", "II", "III", "IV", "V", "VI", "D"];

/**
 * A star back out of its label. SystemSpec 2.6 and PlanetSpec 6.15.13.
 *
 * A document holds the label rather than the four fields, because the label is
 * what a referee reads and types and what a sector line carries. "G2 V" is a
 * star; { spectral: "G", subclass: 2, size: "V" } is the same star written for a
 * machine, and one of the two has to be the stored form.
 */
export function parseStar(label: string): Star | null {
  const text = label.trim().toUpperCase();
  if (text === "" ) return null;
  if (text === "D") return starOf("G", 2, "D");
  const match = /^([OBAFGKM])\s*(\d)?\s*(IA|IB|II|III|IV|V|VI|D)?$/.exec(text.replace(/\s+/g, " "));
  if (match === null) return null;
  const spectral = match[1] as SpectralClass;
  const subclass = match[2] === undefined ? 0 : Number(match[2]);
  const size = (STAR_SIZES.find((held) => held.toUpperCase() === match[3]) ?? "V") as StarSize;
  return starOf(spectral, subclass, size);
}

/**
 * A system's stars back out of the Stars column. SystemSpec 2.6.1.
 *
 * "K5 V M3 V" is a primary and a companion, which is what the column says and
 * all it says: whether the companion rides close or sits outside every orbit is
 * not in the column, so that is taken from what was rolled rather than invented.
 */
export function parseStars(label: string, rolled: Stars): Stars {
  const parts = label.trim().split(/\s+/);
  const stars: Star[] = [];
  for (let at = 0; at < parts.length; ) {
    // A size follows its class unless the class is a lone D, which is its own.
    const twoWords = parseStar(`${parts[at]} ${parts[at + 1] ?? ""}`);
    const oneWord = parseStar(parts[at] ?? "");
    if (twoWords !== null && parts[at + 1] !== undefined) {
      stars.push(twoWords);
      at += 2;
    } else if (oneWord !== null) {
      stars.push(oneWord);
      at += 1;
    } else {
      at += 1;
    }
  }
  if (stars.length === 0) return rolled;
  return {
    primary: stars[0]!,
    companion: stars[1] ?? null,
    // Where a companion sits is not in the column, so it keeps what it had.
    companionOrbit: stars[1] === undefined ? null : (rolled.companionOrbit ?? "far"),
  };
}

/** A star from its parts, with the output that follows from them. */
export function starOf(spectral: SpectralClass, subclass: number, size: StarSize): Star {
  return { spectral, subclass, size, luminosity: luminosityOf(spectral, size) };
}

/**
 * The Stars column of a sector line, which is every star in the system with a
 * space between them. SystemSpec 1.6.4 and 3.7.3: this is the one thing the
 * chart above takes from this level.
 */
export function starsLabel(stars: Stars): string {
  const primary = starLabel(stars.primary);
  return stars.companion === null ? primary : `${primary} ${starLabel(stars.companion)}`;
}
