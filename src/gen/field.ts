import type { Vec3 } from "../grid/vec3";
import { add, normalise, positionKey, scale } from "../grid/vec3";
import { ICO_FACES, ICO_VERTICES } from "../grid/icosahedron";
import { reduceCoord } from "../grid/coord";
import { hashString } from "./rng";

/**
 * The height field, built by repeated subdivision. Spec.md section 3.
 *
 * Level 0 is the twelve icosahedron corners, each given a random height. Every
 * later level halves the lattice spacing, and each new point is the midpoint of
 * an edge from the level before: its height is the average of that edge's two
 * ends, plus or minus an offset that shrinks with each level.
 *
 * Two properties fall out of building it this way, and both matter.
 *
 * A level adds detail at its own scale, so a finer grid gains levels and gains
 * real detail rather than a smoother version of the same surface. And a point's
 * offset is keyed on its position rather than on any index, so a point that
 * exists at several levels, or on two faces at a seam, gets one height. That also
 * means the seed alone fixes the world: raising the size resolves the same
 * continents further instead of producing a different planet.
 */

export interface HeightFieldOptions {
  /** Offset size at level 1, as a fraction of the height range. */
  readonly roughness: number;
  /** Multiplier applied to the offset at each further level. */
  readonly persistence: number;
  /** Half-width of the band the twelve level 0 heights are drawn from. */
  readonly seedSpread: number;
}

export const DEFAULT_FIELD_OPTIONS: HeightFieldOptions = {
  roughness: 0.30,
  persistence: 0.66,
  seedSpread: 0.20,
};

export interface HeightField {
  /** Lattice rows per face in the finished field. Always a power of two. */
  readonly latticeSize: number;
  readonly levels: number;
  /** Height at lattice position (i, j) of a grid of `size` rows on this face. */
  sample(face: number, i: number, j: number, size: number): number;
}

/** Index of lattice point (i, j) in a face's row-major triangular array. */
const at = (i: number, j: number) => (i * (i + 1)) / 2 + j;

/** Points in one face's lattice of `size` rows. */
const latticePoints = (size: number) => ((size + 1) * (size + 2)) / 2;

function position(corners: readonly Vec3[], size: number, i: number, j: number): Vec3 {
  const a = (size - i) / size;
  const b = (i - j) / size;
  const c = j / size;
  return normalise(
    add(add(scale(corners[0]!, a), scale(corners[1]!, b)), scale(corners[2]!, c)),
  );
}

/** Offset for a point, fixed by the seed and where the point is, in [-1, 1). */
function offsetAt(seed: string, key: string): number {
  const h = hashString(`${seed}|${key}`);
  return (h / 4294967296) * 2 - 1;
}

/**
 * Smallest power of two at or above n. The field lattice is binary because the
 * subdivision of 3.2 halves the spacing at every level, so a grid size that is
 * not a power of two samples between lattice points rather than on them.
 */
export function fieldSizeFor(gridSize: number): number {
  let m = 1;
  while (m < gridSize) m *= 2;
  return m;
}

export function buildHeightField(
  seed: string,
  gridSize: number,
  options: HeightFieldOptions = DEFAULT_FIELD_OPTIONS,
): HeightField {
  const m = fieldSizeFor(gridSize);
  const levels = Math.round(Math.log2(m));
  const faceCorners = ICO_FACES.map((f) => f.corners.map((v) => ICO_VERTICES[v]!));

  // One height per distinct point on the sphere, so the twenty faces agree at
  // every seam and every level agrees with the one before it.
  const heights = new Map<string, number>();
  const keyCache: string[][] = faceCorners.map(() => new Array<string>(latticePoints(m)));

  const keyFor = (f: number, size: number, i: number, j: number): string => {
    const step = m / size;
    const index = at(i * step, j * step);
    const cached = keyCache[f]![index];
    if (cached !== undefined) return cached;
    const key = positionKey(position(faceCorners[f]!, size, i, j));
    keyCache[f]![index] = key;
    return key;
  };

  // Level 0: the twelve corners.
  for (let f = 0; f < faceCorners.length; f++) {
    for (const [i, j] of [[0, 0], [1, 0], [1, 1]] as const) {
      const key = keyFor(f, 1, i, j);
      if (!heights.has(key)) {
        heights.set(key, 0.5 + offsetAt(seed, key) * options.seedSpread);
      }
    }
  }

  // Each later level fills in the midpoints of the level before.
  let amplitude = options.roughness;
  for (let level = 1; level <= levels; level++) {
    const size = 1 << level;
    const half = size / 2;
    for (let f = 0; f < faceCorners.length; f++) {
      for (let i = 0; i <= size; i++) {
        for (let j = 0; j <= i; j++) {
          if (i % 2 === 0 && j % 2 === 0) continue; // already has a height
          const [pa, pb] = parents(i, j);
          const ka = keyFor(f, half, pa[0], pa[1]);
          const kb = keyFor(f, half, pb[0], pb[1]);
          const key = keyFor(f, size, i, j);
          if (heights.has(key)) continue; // the other side of a seam got here first
          const mean = (heights.get(ka)! + heights.get(kb)!) / 2;
          heights.set(key, mean + offsetAt(seed, key) * amplitude);
        }
      }
    }
    amplitude *= options.persistence;
  }

  // Flatten to one array per face for cheap sampling.
  const faceValues = faceCorners.map((_, f) => {
    const values = new Float64Array(latticePoints(m));
    for (let i = 0; i <= m; i++) {
      for (let j = 0; j <= i; j++) values[at(i, j)] = heights.get(keyFor(f, m, i, j))!;
    }
    return values;
  });

  return {
    latticeSize: m,
    levels,
    sample(face, i, j, size) {
      const values = faceValues[face]!;
      // In lowest terms first. Two detail levels that share a cell name it with
      // different i, j and size, and the same ratio reached by two different
      // divisions need not come out to the same float. Reduced, they are one
      // triple, so the shared cell reads the same height at either level.
      if (Number.isInteger(i) && Number.isInteger(j)) [i, j, size] = reduceCoord(i, j, size);
      const factor = m / size;
      // Lattice basis coordinates: p steps along one edge, q along the other.
      const p = (i - j) * factor;
      const q = j * factor;
      const p0 = Math.floor(p);
      const q0 = Math.floor(q);
      const fp = p - p0;
      const fq = q - q0;
      // Clamped into the face triangle. A sample sitting exactly on the far edge
      // asks for the point one step beyond it, and although that point carries
      // zero weight, reading past the array would turn the whole sum into NaN.
      const value = (pp: number, qq: number) => {
        const cq = qq < 0 ? 0 : qq > m ? m : qq;
        const cp = pp < 0 ? 0 : pp > m - cq ? m - cq : pp;
        return values[at(cp + cq, cq)]!;
      };
      if (fp + fq <= 1) {
        return (
          value(p0, q0) * (1 - fp - fq) + value(p0 + 1, q0) * fp + value(p0, q0 + 1) * fq
        );
      }
      return (
        value(p0 + 1, q0) * (1 - fq) +
        value(p0, q0 + 1) * (1 - fp) +
        value(p0 + 1, q0 + 1) * (fp + fq - 1)
      );
    },
  };
}

/** The two level-above points whose edge this point bisects. */
function parents(i: number, j: number): [[number, number], [number, number]] {
  if (i % 2 === 1 && j % 2 === 0) return [[(i - 1) / 2, j / 2], [(i + 1) / 2, j / 2]];
  if (i % 2 === 1) return [[(i - 1) / 2, (j - 1) / 2], [(i + 1) / 2, (j + 1) / 2]];
  return [[i / 2, (j - 1) / 2], [i / 2, (j + 1) / 2]];
}

/**
 * The same field, evaluated on demand at any depth. Spec 3.5.
 *
 * buildHeightField fills in every point of every face, which is what the display
 * grid needs and what a deep field cannot afford: each extra level quadruples the
 * work. The local view wants a few thousand points at a depth the whole planet
 * could never be built at, so this walks the recurrence upward from the point
 * asked for instead, computing only that point's ancestors.
 *
 * It is the same recurrence, keyed the same way, so a point evaluated here and the
 * same point in a built field carry the same height. The tests hold the two
 * against each other.
 */
export interface OpenHeightField {
  /** Height at lattice point (i, j) of a face lattice with `size` rows. */
  heightAt(face: number, size: number, i: number, j: number): number;
}

export function openHeightField(
  seed: string,
  options: HeightFieldOptions = DEFAULT_FIELD_OPTIONS,
): OpenHeightField {
  const faceCorners = ICO_FACES.map((f) => f.corners.map((v) => ICO_VERTICES[v]!));
  const cache = new Map<string, number>();

  function heightAt(face: number, size: number, i: number, j: number): number {
    // A point that exists at several levels is the same point. Walking down to the
    // coarsest level it appears at gives it one key, one cache entry, and one
    // amplitude, and stops the even case recursing onto itself for ever.
    while (size > 1 && i % 2 === 0 && j % 2 === 0) {
      size /= 2;
      i /= 2;
      j /= 2;
    }
    const key = positionKey(position(faceCorners[face]!, size, i, j));
    const seen = cache.get(key);
    if (seen !== undefined) return seen;

    let value: number;
    if (size === 1) {
      value = 0.5 + offsetAt(seed, key) * options.seedSpread;
    } else {
      const half = size / 2;
      const [pa, pb] = parents(i, j);
      const mean =
        (heightAt(face, half, pa[0], pa[1]) + heightAt(face, half, pb[0], pb[1])) / 2;
      const level = Math.round(Math.log2(size));
      value = mean + offsetAt(seed, key) * options.roughness * options.persistence ** (level - 1);
    }
    cache.set(key, value);
    return value;
  }

  return { heightAt };
}
