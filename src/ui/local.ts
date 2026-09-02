import { nearestCell, type Grid } from "../grid/grid";
import { faceWeights, ICO_FACES, ICO_VERTICES, locate } from "../grid/icosahedron";
import { latticeRef, type LatticeRef } from "../grid/coord";
import { poiPosition, type Poi } from "../poi";
import { add, normalise, scale, type Vec3 } from "../grid/vec3";
import { fieldSizeFor, openHeightField, type HeightFieldOptions } from "../gen/field";
import { heightColour } from "./colour";
import { scaleBar, stepKm } from "./scale";
import { isIced, type IceCaps } from "../gen/ice";

/**
 * The local view: the selected hex and its surroundings, at a depth the whole
 * planet is never built at. Spec 4.5.
 *
 * The display grid samples a field only as fine as itself, so drawing the same
 * heights larger would show nothing new. This takes the subdivision several levels
 * further and samples that instead, which is why the panel shows detail rather
 * than a magnified version of the middle panel.
 *
 * The window is a patch of lattice around the selected cell. Where it runs off the
 * edge of a face, and at size 24 that is about a third of cells, the point beyond
 * the edge is turned into a direction and looked up again, so the patch continues
 * onto the neighbouring face instead of stopping at the seam.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** Lattice steps per display hex. Eight gives three more levels of subdivision. */
export const ZOOM = 8;

/** How far the patch reaches, in display hexes. */
export const RINGS = 2.5;

export interface LocalInput {
  readonly grid: Grid;
  readonly selected: number | null;
  readonly seed: string;
  readonly options: HeightFieldOptions;
  readonly seaLevel: number;
  readonly diameterKm: number | null;
  readonly caps: IceCaps | null;
  /** How green the land is drawn, from 0 for bare to 1 for an Earth. Spec 5.6. */
  readonly verdancy: number;
  /** The planet's POIs. Those the patch reaches are drawn on their own fine hex. */
  readonly pois: readonly Poi[];
}

/** A hex of the patch the user clicked. Spec 4.5.7. */
export interface Pick {
  /** The fine hex itself, named on the lattice the patch is drawn on. */
  readonly ref: LatticeRef;
  /** The display hex it falls in, which is what the other panels can select. */
  readonly cell: number | null;
}

export interface LocalView {
  readonly element: SVGSVGElement;
  render(input: LocalInput): void;
  /** A hex the user clicked in the patch, which opens the POI dialogue of 4.5.7. */
  onPick(handler: (pick: Pick) => void): void;
}

type Pt2 = readonly [number, number];

export function createLocalView(): LocalView {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "localview");
  let lastSeed = "";
  let field = openHeightField("");
  let pickHandlers: ((pick: Pick) => void)[] = [];
  /** The grid the patch was last drawn from, so a click can be placed on it. */
  let lastGrid: Grid | null = null;
  /** What the last render makes of a point in the patch. */
  let pickAt: ((x: number, y: number) => Pick) | null = null;

  // The fine hex is what a click is answered with, since that is what a POI hangs
  // on under 6.6. The display hex comes back with it, because that is what the
  // other two panels can show a selection on.
  svg.addEventListener("click", (event) => {
    const at = svgPoint(svg, event);
    if (at === null || pickAt === null) return;
    const pick = pickAt(at[0], at[1]);
    for (const h of pickHandlers) h(pick);
  });

  function render(input: LocalInput): void {
    const { grid, selected, seaLevel, verdancy } = input;
    lastGrid = grid;
    if (selected === null) {
      pickAt = null;
      svg.setAttribute("viewBox", "0 0 100 40");
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("class", "localview-empty");
      label.setAttribute("x", "50");
      label.setAttribute("y", "22");
      label.textContent = "Select a hex";
      svg.replaceChildren(label);
      return;
    }

    // One sampler per surface, reused across clicks so the ancestors a patch
    // computes are still there for the next one.
    const key = `${input.seed}|${input.options.roughness}|${input.options.persistence}`;
    if (key !== lastSeed) {
      field = openHeightField(input.seed, input.options);
      lastSeed = key;
    }

    const fine = fieldSizeFor(grid.size) * ZOOM;
    const centre = grid.cells[selected]!.centre;
    const home = locate(centre, fine);
    const iCentre = Math.round(home.i);
    const jCentre = Math.round(home.j);

    const [e1, e2] = latticeBasis(grid, home.face);
    const outline = hexOffsets(e1, e2);
    const reach = Math.round(ZOOM * RINGS);

    // The patch is drawn by walking the lattice out from the centre, so a point
    // in it is placed by walking that the other way: undo the basis to get where
    // it fell in lattice steps, round to the hex that owns it, and read off both
    // the fine hex and the display hex under it.
    const det = e1[0] * e2[1] - e1[1] * e2[0];
    const stepsAt = (x: number, y: number): [number, number] => [
      (x * e2[1] - y * e2[0]) / det,
      (e1[0] * y - e1[1] * x) / det,
    ];
    pickAt = (x, y) => {
      const steps = stepsAt(x, y);
      const [dp, dq] = hexRound(steps[0], steps[1]);
      const i = iCentre + dp + dq;
      const j = jCentre + dq;
      const p = latticePoint(home.face, fine, i, j);
      return {
        ref: latticeRef(home.face, i, j, fine),
        cell: p === null || lastGrid === null ? null : nearestCell(lastGrid, p),
      };
    };

    const hexes: SVGPolygonElement[] = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let dp = -reach; dp <= reach; dp++) {
      const from = Math.max(-reach, -reach - dp);
      const to = Math.min(reach, reach - dp);
      for (let dq = from; dq <= to; dq++) {
        // Lattice basis coordinates back to row and column.
        const i = iCentre + dp + dq;
        const j = jCentre + dq;
        const sample = sampleAt(field, home.face, fine, i, j);
        if (sample === null) continue;

        const x = dp * e1[0] + dq * e2[0];
        const y = dp * e1[1] + dq * e2[1];
        const poly = document.createElementNS(SVG_NS, "polygon");
        poly.setAttribute(
          "points",
          outline.map(([dx, dy]) => `${(x + dx).toFixed(4)},${(y + dy).toFixed(4)}`).join(" "),
        );
        poly.setAttribute("fill", heightColour(sample.height, seaLevel, isIced(input.caps, sample.y), verdancy));
        hexes.push(poly);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    // The clicked hex, outlined at its own size so the patch can be read against
    // the middle panel rather than floating free of it.
    const marker = document.createElementNS(SVG_NS, "polygon");
    const spread = fine / grid.size;
    marker.setAttribute(
      "points",
      hexOffsets(times(e1, spread), times(e2, spread))
        .map(([dx, dy]) => `${dx.toFixed(4)},${dy.toFixed(4)}`)
        .join(" "),
    );
    marker.setAttribute("class", "localview-hex");

    // The POIs the patch reaches, each ringed on the fine hex covering it and
    // named beside it. Spec 4.5.7.3: this panel draws a POI at the size of the
    // hexes it draws, which is the size a POI is placed at here.
    const marks: SVGElement[] = [];
    for (const poi of input.pois) {
      const at = patchOffset(poiPosition(poi.ref), home.face, fine, iCentre, jCentre, e1, e2);
      if (at === null) continue;
      const steps = stepsAt(at[0], at[1]);
      const [dp, dq] = hexRound(steps[0], steps[1]);
      if (Math.abs(dp) > reach || Math.abs(dq) > reach || Math.abs(dp + dq) > reach) continue;
      const x = dp * e1[0] + dq * e2[0];
      const y = dp * e1[1] + dq * e2[1];
      const poly = document.createElementNS(SVG_NS, "polygon");
      poly.setAttribute(
        "points",
        outline.map(([dx, dy]) => `${(x + dx).toFixed(4)},${(y + dy).toFixed(4)}`).join(" "),
      );
      poly.setAttribute("class", `poi-local poi-${poi.kind}`);
      marks.push(poly);
      if (poi.name.trim() !== "") {
        const label = document.createElementNS(SVG_NS, "text");
        label.setAttribute("class", `poi-label poi-${poi.kind}`);
        label.setAttribute("x", x.toFixed(4));
        // Clear of the ring rather than against it, so the name reads as a label
        // on the hex instead of another line drawn across it.
        label.setAttribute("y", (y + 2.4).toFixed(4));
        label.textContent = poi.name;
        marks.push(label);
      }
    }

    const pad = 1;
    const width = maxX - minX + pad * 2;
    const height = maxY - minY + pad * 2;
    svg.setAttribute("viewBox", `${minX - pad} ${minY - pad} ${width} ${height}`);
    svg.replaceChildren(...hexes, marker, ...marks);

    if (input.diameterKm !== null) {
      svg.append(
        scaleBar({
          kmPerUnit: stepKm(input.diameterKm, fine),
          hexKm: stepKm(input.diameterKm, fine),
          width,
          left: minX - pad,
          bottom: maxY + pad,
        }),
      );
    }
  }

  return {
    element: svg,
    render,
    onPick(handler) {
      pickHandlers = [...pickHandlers, handler];
    },
  };
}

/**
 * The lattice point a fractional step count belongs to. Rounding the two counts
 * on their own gives the rhombus around a point rather than the hexagon it owns,
 * so the third axis of the lattice is rounded too and whichever of the three
 * moved furthest is put back from the other two. Spec 4.5.7.1.
 */
export function hexRound(dp: number, dq: number): [number, number] {
  const dr = -dp - dq;
  let rp = Math.round(dp);
  let rq = Math.round(dq);
  const rr = Math.round(dr);
  const offP = Math.abs(rp - dp);
  const offQ = Math.abs(rq - dq);
  const offR = Math.abs(rr - dr);
  if (offP > offQ && offP > offR) rp = -rq - rr;
  else if (offQ > offR) rq = -rp - rr;
  // Negating a zero leaves a negative zero, which is the same step and a
  // different value to anything comparing the two.
  return [rp === 0 ? 0 : rp, rq === 0 ? 0 : rq];
}

/** Where a pointer event landed, in the patch's own coordinates. */
function svgPoint(svg: SVGSVGElement, event: MouseEvent): [number, number] | null {
  const ctm = svg.getScreenCTM?.();
  if (!ctm) return null;
  const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
  return [p.x, p.y];
}

/**
 * A direction's offset in the patch, in the same units the hexes are drawn in, or
 * null where it is on the far side of the world.
 *
 * The barycentric weights of the home face are read rather than the face the
 * point actually belongs to, so a hex just over a seam comes back with the
 * coordinates the patch continues onto it with rather than the ones its own face
 * would give it.
 */
function patchOffset(
  p: Vec3,
  face: number,
  size: number,
  iCentre: number,
  jCentre: number,
  e1: Pt2,
  e2: Pt2,
): Pt2 | null {
  const w = faceWeights(face, p);
  if (w === null) return null;
  const dq = (w[2] * size) - jCentre;
  const dp = (w[1] + w[2]) * size - iCentre - dq;
  return [dp * e1[0] + dq * e2[0], dp * e1[1] + dq * e2[1]];
}

/**
 * The height at a lattice point, or null if it cannot be placed. Points inside the
 * home face resolve to themselves; points beyond an edge are carried onto the face
 * that actually holds them.
 */
export interface Sample {
  readonly height: number;
  /** Height on the unit sphere, which is the sine of the latitude. */
  readonly y: number;
}

export function sampleAt(
  field: { heightAt(face: number, size: number, i: number, j: number): number },
  face: number,
  size: number,
  i: number,
  j: number,
): Sample | null {
  const p = latticePoint(face, size, i, j);
  if (p === null) return null;
  const found = locate(p, size);
  const fi = Math.round(found.i);
  const fj = Math.round(found.j);
  if (fj < 0 || fi > size || fj > fi) return null;
  const h = field.heightAt(found.face, size, fi, fj);
  return { height: h < 0 ? 0 : h > 1 ? 1 : h, y: p[1] };
}

/**
 * A lattice point as a direction, allowing rows and columns outside the face. The
 * barycentric weights go negative past an edge, which continues the lattice
 * straight on rather than stopping at it.
 */
export function latticePoint(face: number, size: number, i: number, j: number): Vec3 | null {
  const c = ICO_FACES[face]!.corners.map((v) => ICO_VERTICES[v]!) as [Vec3, Vec3, Vec3];
  const w: [number, number, number] = [(size - i) / size, (i - j) / size, j / size];
  const p = add(add(scale(c[0], w[0]), scale(c[1], w[1])), scale(c[2], w[2]));
  const length = Math.hypot(p[0], p[1], p[2]);
  // Far enough outside the face that the continuation has stopped meaning
  // anything. Only reachable from a patch wider than a face.
  if (length < 1e-6) return null;
  return normalise(p);
}

/**
 * The face's two lattice steps as unit vectors, so the patch is drawn at the same
 * orientation this face has in the middle panel. Recovered from the hexagon
 * outline the grid already carries: its first and last corners sum to one step.
 */
function latticeBasis(grid: Grid, face: number): [Pt2, Pt2] {
  const off = grid.net[face]!.hexOffsets;
  const first = off[0]!;
  const step1: Pt2 = [first[0] + off[5]![0], first[1] + off[5]![1]];
  const step2: Pt2 = [first[0] * 3 - step1[0], first[1] * 3 - step1[1]];
  const unit = Math.hypot(step1[0], step1[1]);
  return [
    [step1[0] / unit, step1[1] / unit],
    [step2[0] / unit, step2[1] / unit],
  ];
}

const times = (p: Pt2, k: number): Pt2 => [p[0] * k, p[1] * k];

/** Hexagon outline for a lattice with steps e1 and e2, as in the grid's dual. */
function hexOffsets(e1: Pt2, e2: Pt2): readonly Pt2[] {
  const combine = (a: number, b: number): Pt2 => [
    (a * e1[0] + b * e2[0]) / 3,
    (a * e1[1] + b * e2[1]) / 3,
  ];
  return [combine(1, 1), combine(-1, 2), combine(-2, 1), combine(-1, -1), combine(1, -2), combine(2, -1)];
}
