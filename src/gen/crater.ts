import type { Vec3 } from "../grid/vec3";
import { ICO_FACES, ICO_VERTICES } from "../grid/icosahedron";
import { valueFor } from "./rng";
import { fractionFor, type PlanetDetail } from "./detail";
import { erosion, fieldOptionsFor } from "./shape";
import { DEFAULT_FIELD_OPTIONS } from "./field";
import { parseUwp } from "../planet";

/**
 * Impact craters, laid over the subdivision field.
 *
 * The field of field.ts makes ground: ridges, basins, a coastline. It cannot make
 * a crater, because a crater is not a scale of terrain but an event at a place - a
 * circle of a definite size dropped on whatever was already there. So craters are
 * a second layer, added to a height after the field has been sampled rather than
 * folded into the recurrence that produces it.
 *
 * Keeping them apart buys three things. The field stays the field, so the
 * invariant that a point reads the same height at every detail level is untouched.
 * A crater is the same crater on the map, on the globe and in the local panel,
 * because all three add the same function of position. And the crater set can be
 * rebuilt from the UWP without rebuilding the field, which is the expensive thing.
 *
 * How many a world keeps is a matter of what has been rubbing them out. Every
 * world has been hit about as often for its size; what differs is whether the
 * scars survived, and air and water are what remove them. So the count comes off
 * the erosion figure of 3.4 - an airless, waterless rock keeps nearly everything
 * that ever hit it, and a thick wet world keeps nothing worth drawing.
 */

/** A single impact, with the trigonometry it is tested against precomputed. */
export interface Crater {
  /** Unit-sphere direction of the impact point. */
  readonly centre: Vec3;
  /** Angular radius of the rim, in radians. */
  readonly radius: number;
  /** Depth of the floor below the ground it fell on, in height-field units. */
  readonly depth: number;
  /** Height of the rim above that ground, in the same units. */
  readonly rim: number;
  /** Chord distance from the centre to the rim. */
  readonly rimChord: number;
  /** Chord distance to the far edge of the ejecta, squared: the early reject. */
  readonly outerChord2: number;
  /** Chord width of the ejecta blanket, rim to nothing. */
  readonly ejectaChord: number;
}

export interface CraterOptions {
  /** How many impacts to place. */
  readonly count: number;
  /** Angular radius of the smallest crater, in radians. */
  readonly minRadius: number;
  /** Angular radius of the largest, in radians. */
  readonly maxRadius: number;
  /**
   * Slope of the size distribution: the number of craters larger than r goes as r
   * to the minus this. Two is about what a real cratered surface counts out at,
   * and it is also what makes this affordable, since it puts nearly all of the
   * count into craters too small to cover much ground.
   */
  readonly slope: number;
  /** Depth of a crater one radian across, as a fraction of the height range. */
  readonly depthAtUnitRadius: number;
  /**
   * The deepest a crater may be cut, whatever its width. Past a few degrees a real
   * crater floor collapses back on itself and stops getting deeper, and without a
   * ceiling the largest basin on a world would punch clean through the range the
   * colours are drawn over.
   */
  readonly maxDepth: number;
  /**
   * How depth grows with radius. Below one, so a large crater is shallow for its
   * width, which is what a real crater floor does once it is wide enough to
   * collapse back on itself.
   */
  readonly depthPower: number;
  /** Rim height as a fraction of the depth. */
  readonly rimFraction: number;
  /** How far the ejecta reaches, as a multiple of the rim radius. */
  readonly ejectaReach: number;
}

const radiansOf = (deg: number): number => (deg * Math.PI) / 180;

/**
 * The smallest crater the finest map can draw, near enough.
 *
 * A hex at 96 rows to a face covers about three quarters of a degree, so a crater
 * below that is a single darker hex and reads as noise rather than as a circle.
 * Spending the count below the line the map can resolve buys nothing on the map
 * and costs the same as spending it above, so the floor sits where the drawing
 * starts. The local panel goes deeper than this and would show smaller ones; it
 * can be given its own floor if that is ever wanted.
 */
const SMALLEST_DRAWABLE_DEG = 1;

export const DEFAULT_CRATER_OPTIONS: CraterOptions = {
  count: 0,
  minRadius: radiansOf(SMALLEST_DRAWABLE_DEG),
  maxRadius: radiansOf(14),
  slope: 2,
  depthAtUnitRadius: 1.6,
  depthPower: 0.7,
  maxDepth: 0.22,
  rimFraction: 0.22,
  ejectaReach: 2.2,
};

/**
 * The coarse lattice craters are filed under: this many rows to a face.
 *
 * Every sample already knows its face and its place on that face's lattice, so the
 * bucket it falls in costs two divisions and no search. Eight rows puts 36 buckets
 * on a face and 720 on the world, each about eight degrees across, which is small
 * enough that a sample tests a handful of craters instead of all of them and large
 * enough that a crater is filed under a handful of buckets instead of hundreds.
 */
export const BUCKET_ROWS = 8;

/** Numbers held per crater in the flattened bucket lists below. */
const STRIDE = 9;

export interface CraterField {
  readonly craters: readonly Crater[];
  /** How many craters are filed under the busiest bucket. */
  readonly worstBucket: number;
  /** Craters tested per sample, averaged over the buckets that exist. */
  readonly meanTested: number;
  /**
   * The height to add at lattice point (i, j) of a face lattice of `size` rows.
   * Zero over most of the world, which is the point of the buckets.
   */
  offsetAt(face: number, size: number, i: number, j: number): number;
}

/** The empty layer: a world nothing has hit, and what a caller falls back to. */
export const NO_CRATERS: CraterField = {
  craters: [],
  worstBucket: 0,
  meanTested: 0,
  offsetAt: () => 0,
};

/** Chord distance between two unit vectors, squared. */
function chord2(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

function normalise3(x: number, y: number, z: number): Vec3 {
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
}

/**
 * The twenty faces' corners, laid out flat: nine numbers a face, three a corner.
 *
 * The sample loop below runs once per hex per redraw, which is a hundred thousand
 * times at the finest level, so it is written to allocate nothing. Reading the
 * corners through ICO_FACES each time builds a three element array of three
 * element arrays per sample, and at that rate the garbage costs more than the
 * craters do.
 */
const FACE_CORNERS = (() => {
  const out = new Float64Array(20 * 9);
  for (let f = 0; f < 20; f++) {
    const corners = ICO_FACES[f]!.corners;
    for (let k = 0; k < 3; k++) {
      const v = ICO_VERTICES[corners[k]!]!;
      out[f * 9 + k * 3] = v[0];
      out[f * 9 + k * 3 + 1] = v[1];
      out[f * 9 + k * 3 + 2] = v[2];
    }
  }
  return out;
})();

/** The direction of a point given in a face's lattice coordinates. */
function faceDirection(face: number, size: number, i: number, j: number): Vec3 {
  const b = face * 9;
  const wa = (size - i) / size;
  const wb = (i - j) / size;
  const wc = j / size;
  return normalise3(
    FACE_CORNERS[b]! * wa + FACE_CORNERS[b + 3]! * wb + FACE_CORNERS[b + 6]! * wc,
    FACE_CORNERS[b + 1]! * wa + FACE_CORNERS[b + 4]! * wb + FACE_CORNERS[b + 7]! * wc,
    FACE_CORNERS[b + 2]! * wa + FACE_CORNERS[b + 5]! * wb + FACE_CORNERS[b + 8]! * wc,
  );
}

/**
 * The craters themselves, placed by the seed alone.
 *
 * Positions are uniform over the sphere - impacts do not prefer a hemisphere -
 * which means uniform in height and in longitude rather than uniform in latitude,
 * or the poles would collect them.
 *
 * Radii come off the power law the slope names, drawn by inversion and cut off at
 * both ends. The cut at the top is what stops one world in fifty from being a
 * single basin; the cut at the bottom is where the finest lattice gives up on
 * resolving a circle at all.
 */
export function craterList(seed: string, options: CraterOptions): Crater[] {
  const { count, minRadius, maxRadius, slope } = options;
  const craters: Crater[] = new Array(count);
  // The share of the law that falls inside the two cuts, so truncating rescales
  // the whole draw rather than piling every oversized draw onto the ceiling.
  const span = 1 - (minRadius / maxRadius) ** slope;
  for (let n = 0; n < count; n++) {
    const y = valueFor(`${seed}:crater:y`, n) * 2 - 1;
    const lon = valueFor(`${seed}:crater:lon`, n) * 2 * Math.PI;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const centre: Vec3 = [ring * Math.cos(lon), y, ring * Math.sin(lon)];

    const u = valueFor(`${seed}:crater:r`, n) * span;
    const radius = minRadius / (1 - u) ** (1 / slope);
    const depth = Math.min(
      options.maxDepth,
      options.depthAtUnitRadius * radius ** options.depthPower,
    );
    const rimChord = 2 * Math.sin(radius / 2);
    const outer = Math.min(Math.PI, radius * options.ejectaReach);
    const outerChord = 2 * Math.sin(outer / 2);
    craters[n] = {
      centre,
      radius,
      depth,
      rim: depth * options.rimFraction,
      rimChord,
      outerChord2: outerChord * outerChord,
      ejectaChord: Math.max(1e-9, outerChord - rimChord),
    };
  }
  return craters;
}

/**
 * The bucket middles and how far each one reaches, for a lattice of `rows` rows to
 * a face. Memoised, since the lattice does not depend on the seed and a session
 * rebuilds its crater field far more often than it changes the resolution.
 */
const LATTICES = new Map<number, Lattice>();

interface Lattice {
  readonly rows: number;
  readonly perFace: number;
  readonly count: number;
  readonly centres: readonly (Vec3 | null)[];
  readonly reaches: Float64Array;
  readonly faceCentres: Float64Array;
  readonly faceReaches: Float64Array;
}

function latticeOf(rows: number): Lattice {
  const held = LATTICES.get(rows);
  if (held) return held;
  const perFace = rows * rows;
  const count = 20 * perFace;
  const centres: (Vec3 | null)[] = new Array(count).fill(null);
  const reaches = new Float64Array(count);
  // A cap around each whole face, so filing a crater can throw out seventeen
  // faces on twenty tests instead of walking every bucket in the world.
  const faceCentres = new Float64Array(20 * 3);
  const faceReaches = new Float64Array(20);
  for (let f = 0; f < 20; f++) {
    for (let p = 0; p < rows; p++) {
      for (let q = 0; q + p < rows; q++) {
        const index = f * perFace + p * rows + q;
        const corners: Vec3[] = [];
        for (const [dp, dq] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
          // The far corner of the last rhombus in a row hangs off the triangle,
          // so it is pulled back onto the edge rather than solved outside it.
          const cq = Math.min(q + dq, rows);
          const cp = Math.min(p + dp, rows - cq);
          corners.push(faceDirection(f, rows, cp + cq, cq));
        }
        let x = 0;
        let y = 0;
        let z = 0;
        for (const c of corners) {
          x += c[0];
          y += c[1];
          z += c[2];
        }
        const mid = normalise3(x, y, z);
        let worst = 0;
        for (const c of corners) worst = Math.max(worst, chord2(mid, c));
        centres[index] = mid;
        reaches[index] = Math.sqrt(worst);
      }
    }
    const c = ICO_FACES[f]!.corners.map((v) => ICO_VERTICES[v]!) as [Vec3, Vec3, Vec3];
    const mid = normalise3(
      c[0][0] + c[1][0] + c[2][0],
      c[0][1] + c[1][1] + c[2][1],
      c[0][2] + c[1][2] + c[2][2],
    );
    faceCentres[f * 3] = mid[0];
    faceCentres[f * 3 + 1] = mid[1];
    faceCentres[f * 3 + 2] = mid[2];
    let worst = 0;
    for (const corner of c) worst = Math.max(worst, chord2(mid, corner));
    faceReaches[f] = Math.sqrt(worst);
  }
  const lattice: Lattice = { rows, perFace, count, centres, reaches, faceCentres, faceReaches };
  LATTICES.set(rows, lattice);
  return lattice;
}

export function buildCraterField(
  seed: string,
  options: CraterOptions = DEFAULT_CRATER_OPTIONS,
  rows: number = BUCKET_ROWS,
): CraterField {
  if (options.count <= 0) return NO_CRATERS;
  const craters = craterList(seed, options);
  const {
    perFace,
    count: bucketCount,
    centres: bucketCentres,
    reaches: bucketReaches,
    faceCentres,
    faceReaches,
  } = latticeOf(rows);

  // A crater is filed under every bucket its ejecta can touch, and that is the one
  // test the whole scheme rests on: a sample only ever looks in its own bucket, so
  // a crater missing from a bucket it overlaps would be a crater with a bite out
  // of it. Chord distance does not obey the triangle inequality exactly, but the
  // slack is far inside a whole bucket width, and the bucket's reach is already
  // the distance to its furthest corner.
  const lists: Crater[][] = Array.from({ length: bucketCount }, () => []);
  for (const crater of craters) {
    const outer = Math.sqrt(crater.outerChord2);
    const cx = crater.centre[0];
    const cy = crater.centre[1];
    const cz = crater.centre[2];
    for (let f = 0; f < 20; f++) {
      const fx = cx - faceCentres[f * 3]!;
      const fy = cy - faceCentres[f * 3 + 1]!;
      const fz = cz - faceCentres[f * 3 + 2]!;
      const faceLimit = outer + faceReaches[f]!;
      if (fx * fx + fy * fy + fz * fz > faceLimit * faceLimit) continue;
      for (let b = f * perFace; b < (f + 1) * perFace; b++) {
        const mid = bucketCentres[b];
        if (mid === null || mid === undefined) continue;
        const limit = outer + bucketReaches[b]!;
        if (chord2(mid, crater.centre) <= limit * limit) lists[b]!.push(crater);
      }
    }
  }

  // Flattened into plain numbers with a start index per bucket, so the hot loop
  // walks one run of one typed array rather than chasing objects through an array
  // of arrays. Seven numbers a crater: centre, then what the profile reads.
  const starts = new Int32Array(bucketCount + 1);
  for (let b = 0; b < bucketCount; b++) starts[b + 1] = starts[b]! + lists[b]!.length;
  const flat = new Float64Array(starts[bucketCount]! * STRIDE);
  for (let b = 0, at = 0; b < bucketCount; b++) {
    for (const c of lists[b]!) {
      flat[at] = c.centre[0];
      flat[at + 1] = c.centre[1];
      flat[at + 2] = c.centre[2];
      flat[at + 3] = c.outerChord2;
      flat[at + 4] = c.rimChord;
      flat[at + 5] = c.depth;
      flat[at + 6] = c.rim;
      flat[at + 7] = c.ejectaChord;
      flat[at + 8] = Math.sqrt(c.outerChord2);
      at += STRIDE;
    }
  }

  let worstBucket = 0;
  let used = 0;
  let filed = 0;
  for (let b = 0; b < bucketCount; b++) {
    if (bucketCentres[b] === null) continue;
    used++;
    filed += lists[b]!.length;
    if (lists[b]!.length > worstBucket) worstBucket = lists[b]!.length;
  }

  /** The bucket a face lattice point falls in. */
  function bucketFor(face: number, size: number, i: number, j: number): number {
    const k = rows / size;
    let q = Math.floor(j * k);
    if (q < 0) q = 0;
    else if (q >= rows) q = rows - 1;
    let p = Math.floor((i - j) * k);
    if (p < 0) p = 0;
    else if (p > rows - 1 - q) p = rows - 1 - q;
    return face * perFace + p * rows + q;
  }

  return {
    craters,
    worstBucket,
    meanTested: used === 0 ? 0 : filed / used,
    offsetAt(face, size, i, j) {
      const bucket = bucketFor(face, size, i, j);
      const end = starts[bucket + 1]! * STRIDE;
      let at = starts[bucket]! * STRIDE;
      // Most of a world is ground nothing landed on, and the whole point of the
      // buckets is that those hexes leave here without touching a crater at all.
      if (at === end) return 0;

      // The direction, worked out here rather than through faceDirection, so the
      // three numbers stay in registers instead of becoming an array.
      const b = face * 9;
      const wa = (size - i) / size;
      const wb = (i - j) / size;
      const wc = j / size;
      let px = FACE_CORNERS[b]! * wa + FACE_CORNERS[b + 3]! * wb + FACE_CORNERS[b + 6]! * wc;
      let py = FACE_CORNERS[b + 1]! * wa + FACE_CORNERS[b + 4]! * wb + FACE_CORNERS[b + 7]! * wc;
      let pz = FACE_CORNERS[b + 2]! * wa + FACE_CORNERS[b + 5]! * wb + FACE_CORNERS[b + 8]! * wc;
      const len = Math.sqrt(px * px + py * py + pz * pz);
      px /= len;
      py /= len;
      pz /= len;

      let total = 0;
      for (; at < end; at += STRIDE) {
        const dx = px - flat[at]!;
        const dy = py - flat[at + 1]!;
        const dz = pz - flat[at + 2]!;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= flat[at + 3]!) continue;
        const chord = Math.sqrt(d2);
        const rimChord = flat[at + 4]!;
        if (chord <= rimChord) {
          // A parabolic bowl from the floor up to the rim, plus a lip that only
          // lifts near the edge, so the floor is not raised by its own rim.
          const d = chord / rimChord;
          const dd = d * d;
          total += flat[at + 5]! * (dd - 1) + flat[at + 6]! * dd * dd;
        } else {
          // Outside the rim the ejecta thins away. Squared rather than straight,
          // so it lands flush with the ground instead of meeting it at an angle.
          const t = (flat[at + 8]! - chord) / flat[at + 7]!;
          total += flat[at + 6]! * t * t;
        }
      }
      return total;
    },
  };
}

/**
 * How many craters a world carries.
 *
 * A surface nothing has touched keeps every mark: the Moon, Mercury, the highlands
 * of Mars. A surface with weather keeps none worth drawing. So the count runs from
 * a full record down to nothing across the erosion figure that air and water
 * already produce for the terrain, and the same figure that rounds off the ridges
 * fills in the craters.
 *
 * How full a full record is, is drawn from the seed. Two airless rocks with the
 * same profile have not been hit the same number of times: one sat in a crowded
 * part of a young system and one did not, and the profile has nothing to say about
 * which. So the ceiling is a band rather than a figure, read off the seed like the
 * other world settings of 6.15, and the erosion figure scales whatever it drew.
 *
 * The band is chosen for what it looks like rather than for what it would count
 * out at. At the low end the circles are countable; at the high end the surface is
 * saturated and a new impact lands on an old one.
 */
const PRISTINE_COUNT = { fewest: 500, most: 1800 } as const;

/** Below this much erosion a world is counted as keeping its record intact. */
const PRISTINE_EROSION = 0.05;
/**
 * Above this much, nothing of it is left. Set just under what an Earth works out
 * to, so a world with a standard atmosphere and oceans comes out with none rather
 * than with the handful a hair's breadth either side of the line would leave.
 */
const ERASED_EROSION = 0.45;

/**
 * The most a user may ask for. Past this the layer costs a fifth of a redraw at
 * the finest level for a surface that was already saturated thousands of impacts
 * ago, so the ceiling is where the pictures stop improving rather than where the
 * arithmetic stops working.
 */
export const MAX_CRATERS = 20000;

/** What the seed and the profile give, before anyone overrules it. Spec 3.6.2. */
export function rolledCraterCount(seed: string, detail: PlanetDetail, uwp: string): number {
  const profile = parseUwp(uwp);
  if (profile === null) return 0;
  const wear = erosion(detail, profile.atmosphere);
  const kept = clamp01((ERASED_EROSION - wear) / (ERASED_EROSION - PRISTINE_EROSION));
  const pristine =
    PRISTINE_COUNT.fewest +
    (PRISTINE_COUNT.most - PRISTINE_COUNT.fewest) * fractionFor(seed, "craters");
  return Math.round(pristine * kept);
}

/**
 * The crater layer a planet asks for. Spec 6.15.12.
 *
 * `override` is the world setting: null means nobody has overruled the roll, which
 * is not the same as a count of zero, so the two cases are held apart the way the
 * other settings of 6.15.3 hold them apart.
 */
export function craterOptionsFor(
  seed: string,
  detail: PlanetDetail,
  uwp: string,
  override: number | null = null,
): CraterOptions {
  const wanted = override ?? rolledCraterCount(seed, detail, uwp);
  // Cut to the same depth the terrain is drawn in relief at. A heavy world cannot
  // hold up tall ground and cannot hold open a deep hole either, so a crater on
  // one is shallow for the same reason its mountains are low, and it stays in
  // proportion to the ground it was dug out of rather than swamping it.
  const relief = fieldOptionsFor(detail, uwp).roughness / DEFAULT_FIELD_OPTIONS.roughness;
  return {
    ...DEFAULT_CRATER_OPTIONS,
    count: Math.min(MAX_CRATERS, Math.max(0, Math.round(wanted))),
    depthAtUnitRadius: DEFAULT_CRATER_OPTIONS.depthAtUnitRadius * relief,
    maxDepth: DEFAULT_CRATER_OPTIONS.maxDepth * relief,
  };
}

/**
 * How much of the surface is inside a rim, counting the overlaps. Over one means
 * the world is saturated: a new impact lands on an old one rather than on ground.
 */
export function saturationOf(craters: readonly Crater[]): number {
  let area = 0;
  for (const c of craters) area += 2 * Math.PI * (1 - Math.cos(c.radius));
  return area / (4 * Math.PI);
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
