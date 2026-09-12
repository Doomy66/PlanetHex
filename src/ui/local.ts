import { nearestCell, type Grid } from "../grid/grid";
import { faceWeights, ICO_FACES, ICO_VERTICES, locate } from "../grid/icosahedron";
import { latticeRef, type LatticeRef } from "../grid/coord";
import { poiPosition, type Poi } from "../poi";
import { add, normalise, scale, type Vec3 } from "../grid/vec3";
import { fieldSizeFor, openHeightField, type HeightFieldOptions } from "../gen/field";
import { NO_CRATERS, type CraterField } from "../gen/crater";
import { heightColour } from "./colour";
import { scaleBar, stepKm } from "./scale";
import { isIced, type IceCaps } from "../gen/ice";
import { planContours, traceContours, type Step } from "./contour";
import { isoView, SQUASH } from "./iso";
import { createReliefView } from "./relief";

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

/**
 * How much larger than its own hexagon a fill is drawn when the seams are off.
 * Enough to close the hairline between two of them, and far too little to move
 * where the colour turns by anything a contour line could sit beside.
 */
const OVERLAP = 1.04;

export interface LocalInput {
  readonly grid: Grid;
  readonly selected: number | null;
  readonly seed: string;
  readonly options: HeightFieldOptions;
  /** The impacts the world carries, so a crater is the same crater here as on the
   *  map. Spec 3.6.1: every view adds the same function of position. */
  readonly craters: CraterField;
  readonly seaLevel: number;
  readonly diameterKm: number | null;
  readonly caps: IceCaps | null;
  /** How green the land is drawn, from 0 for bare to 1 for an Earth. Spec 5.6. */
  readonly verdancy: number;
  /** The planet's POIs. Those the patch reaches are drawn on their own fine hex. */
  readonly pois: readonly Poi[];
  /** Whether to draw contour lines over the patch. Spec 4.5.8. */
  readonly contours: boolean;
  /** Whether to draw the patch in relief, seen from over it rather than above it. Spec 4.5.9. */
  readonly isometric: boolean;
}

/** A hex of the patch the user clicked. Spec 4.5.7. */
export interface Pick {
  /** The fine hex itself, named on the lattice the patch is drawn on. */
  readonly ref: LatticeRef;
  /** The display hex it falls in, which is what the other panels can select. */
  readonly cell: number | null;
}

export interface LocalView {
  readonly element: HTMLElement;
  render(input: LocalInput): void;
  /** A hex the user clicked in the patch, which opens the POI dialogue of 4.5.7. */
  onPick(handler: (pick: Pick) => void): void;
}

type Pt2 = readonly [number, number];

export function createLocalView(): LocalView {
  // The panel is two layers: the lit ground of 4.5.9 in its own canvas, and over
  // it the SVG, which draws the hexes of the flat view and, in either view, the
  // marks and the scale bar that go on top of the ground rather than in it.
  const element = document.createElement("div");
  element.className = "localview-stack";
  const relief = createReliefView();
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "localview");
  element.append(relief.element, svg);
  let lastSeed = "";
  let open = openHeightField("");
  /** The open field with the crater layer folded in, which is what a patch reads. */
  let field: { heightAt(face: number, size: number, i: number, j: number): number } = open;
  let pickHandlers: ((pick: Pick) => void)[] = [];
  /** What was last drawn, so a change of the panel's shape can be redrawn. */
  let last: LocalInput | null = null;
  /** The grid the patch was last drawn from, so a click can be placed on it. */
  let lastGrid: Grid | null = null;
  /** What the last render makes of a point in the patch. */
  let pickAt: ((x: number, y: number) => Pick) | null = null;
  /** The crater layer the sampler above was wrapped around. */
  let lastCraters: CraterField | null = null;

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
    last = input;
    lastGrid = grid;
    if (selected === null) {
      pickAt = null;
      relief.element.hidden = true;
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
      open = openHeightField(input.seed, input.options);
      lastSeed = key;
      lastCraters = null;
    }
    if (input.craters !== lastCraters) {
      lastCraters = input.craters;
      const held = open;
      const craters = input.craters;
      field =
        craters === NO_CRATERS
          ? held
          : { heightAt: (f, n, i, j) => held.heightAt(f, n, i, j) + craters.offsetAt(f, n, i, j) };
    }

    const fine = fieldSizeFor(grid.size) * ZOOM;
    const centre = grid.cells[selected]!.centre;
    const home = locate(centre, fine);
    const iCentre = Math.round(home.i);
    const jCentre = Math.round(home.j);

    const [e1, e2] = latticeBasis(grid, home.face);
    const outline = hexOffsets(e1, e2);
    const reach = Math.round(ZOOM * RINGS);

    // With contours on, the seams give way to the lines under 4.5.8.7, and two
    // hexes sharing an exact edge still leave a hairline of the ground behind
    // showing between them. So the fills are drawn a hair large and overlap
    // instead. Off, the panel is drawn exactly as it always was.
    svg.classList.toggle("contoured", input.contours);
    const fill = input.contours ? hexOffsets(times(e1, OVERLAP), times(e2, OVERLAP)) : outline;

    // The patch is drawn by walking the lattice out from the centre, so a point
    // in it is placed by walking that the other way: undo the basis to get where
    // it fell in lattice steps, round to the hex that owns it, and read off both
    // the fine hex and the display hex under it.
    const det = e1[0] * e2[1] - e1[1] * e2[0];
    const stepsAt = (x: number, y: number): [number, number] => [
      (x * e2[1] - y * e2[0]) / det,
      (e1[0] * y - e1[1] * x) / det,
    ];
    // Nothing is placed from the relief view. A click would have to be put back
    // through the projection onto ground that may be hidden behind nearer ground,
    // and a POI landing on a hex the user did not mean is worse than a panel that
    // does not take the click. Spec 4.5.9.5.
    pickAt = input.isometric ? null : (x, y) => {
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

    /** A fractional lattice offset as a point on the flat ground. */
    const ground = (at: Step): Pt2 => [
      at[0] * e1[0] + at[1] * e2[0],
      at[0] * e1[1] + at[1] * e2[1],
    ];
    const flat = (at: Step): string => {
      const [x, y] = ground(at);
      return `${x.toFixed(4)} ${y.toFixed(4)}`;
    };

    /** Every height the patch found, kept for the contours of 4.5.8 to cut. */
    const heights = new Map<string, number>();
    /** One hex of the patch, sampled but not yet drawn. */
    interface Found {
      readonly dp: number;
      readonly dq: number;
      readonly x: number;
      readonly y: number;
      readonly height: number;
      readonly iced: boolean;
    }
    const found: Found[] = [];
    let low = Infinity;
    let high = -Infinity;

    // The whole patch is sampled before any of it is drawn. In relief it has to go
    // down the drawing from the back, and a contour has to be cut before the hex it
    // lies on is drawn, so neither can be done in one pass over the lattice.
    for (let dp = -reach; dp <= reach; dp++) {
      const from = Math.max(-reach, -reach - dp);
      const to = Math.min(reach, reach - dp);
      for (let dq = from; dq <= to; dq++) {
        // Lattice basis coordinates back to row and column.
        const i = iCentre + dp + dq;
        const j = jCentre + dq;
        const sample = sampleAt(field, home.face, fine, i, j);
        if (sample === null) continue;
        found.push({
          dp,
          dq,
          x: dp * e1[0] + dq * e2[0],
          y: dp * e1[1] + dq * e2[1],
          height: sample.height,
          iced: isIced(input.caps, sample.y),
        });
        heights.set(`${dp},${dq}`, sample.height);
        if (sample.height < low) low = sample.height;
        if (sample.height > high) high = sample.height;
      }
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const note = (x: number, y: number): void => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };

    /** The view in relief, or null where the patch is drawn flat. Spec 4.5.9. */
    const view = input.isometric && found.length > 0 ? isoView(low) : null;
    const points = (pts: readonly Pt2[]): string =>
      pts.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(" ");

    // Contour lines, drawn along the sides between hexes whose heights fall either
    // side of a level, so a line lies exactly on the colour it separates. Spec 4.5.8.
    // A dark line is lost on the deep sea and a light one on snow, so each level is
    // drawn against the half of the ramp it belongs to.
    const shadeOf = (level: number) => (level >= seaLevel ? "contour-land" : "contour-sea");
    const lines: SVGElement[] = [];
    let interval = 0;
    // Lines belong to the flat view. In relief the light does what they do, and
    // better: what a contour says about a slope, a shaded hillside shows. Spec
    // 4.5.9.6.
    if (input.contours && view === null && heights.size > 0) {
      const plan = planContours(low, high, seaLevel);
      interval = plan.step;
      const traced = traceContours(
        (dp, dq) => heights.get(`${dp},${dq}`) ?? null,
        reach,
        plan.levels,
      );
      const group = document.createElementNS(SVG_NS, "g");
      group.setAttribute("class", "contours");
      for (const line of traced) {
        if (line.segments.length === 0) continue;
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute(
          "d",
          line.segments.map(({ from, to }) => `M${flat(from)}L${flat(to)}`).join(""),
        );
        path.setAttribute("class", shadeOf(line.level));
        group.append(path);
      }
      if (group.childElementCount > 0) lines.push(group);
    }

    // The hexes. Flat, or as a lid with the cut earth of the ground under it, in
    // which case they go down the drawing from the back so that what stands in
    // front is drawn over what is behind it. Spec 4.5.9.2.
    const hexes: SVGElement[] = [];
    if (view === null) {
      for (const cell of found) {
        const poly = document.createElementNS(SVG_NS, "polygon");
        poly.setAttribute("points", points(fill.map(([dx, dy]) => [cell.x + dx, cell.y + dy])));
        poly.setAttribute("fill", heightColour(cell.height, seaLevel, cell.iced, verdancy));
        hexes.push(poly);
        note(cell.x, cell.y);
      }
    } else {
      // The ground is the canvas's, so what the patch needs from the SVG is only
      // the room it takes up: the surface, and the floor of the block under it.
      for (const cell of found) {
        const [cx, cy] = view.place(cell.x, cell.y, cell.height);
        for (const [dx, dy] of fill) note(cx + dx, cy + dy * SQUASH);
        note(cx, view.floor(cell.y));
      }
    }

    // The clicked hex, outlined at its own size so the patch can be read against
    // the middle panel rather than floating free of it. The flat view only: in
    // relief there is nothing for it to do. It is there to say which display hex
    // the patch is of, and that is a question about the map, which is what the
    // flat view is. Over lit ground it is a wire hoop in the way of the thing the
    // view was turned on to look at. Spec 4.5.9.4.
    const spread = fine / grid.size;
    const marker = view === null ? document.createElementNS(SVG_NS, "polygon") : null;
    if (marker !== null) {
      marker.setAttribute("points", points(hexOffsets(times(e1, spread), times(e2, spread))));
      marker.setAttribute("class", "localview-hex");
    }

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
      // On the ground, or on the lid of its own hex where the patch stands in
      // relief. Either way the ring is the hex the POI is on. Spec 4.5.9.4.
      const flatAt: Pt2 = [dp * e1[0] + dq * e2[0], dp * e1[1] + dq * e2[1]];
      const shape = view === null ? outline : outline.map(([dx, dy]) => [dx, dy * SQUASH] as Pt2);
      const [x, y] =
        view === null
          ? flatAt
          : view.place(flatAt[0], flatAt[1], heights.get(`${dp},${dq}`) ?? low);
      const poly = document.createElementNS(SVG_NS, "polygon");
      poly.setAttribute("points", points(shape.map(([dx, dy]) => [x + dx, y + dy])));
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

    // The window the patch is drawn into is given the panel's own proportions
    // rather than the patch's, by growing the shorter side of it. An SVG centres a
    // viewBox that does not match its element, which would leave the scale bar
    // floating in from the edge of the panel instead of standing on it. Spec 4.6.5.
    const pad = 1;
    let left = minX - pad;
    let top = minY - pad;
    let width = maxX - minX + pad * 2;
    let height = maxY - minY + pad * 2;
    const shape = svg.clientWidth > 0 && svg.clientHeight > 0 ? svg.clientWidth / svg.clientHeight : width / height;
    if (width / height < shape) {
      const grown = height * shape;
      left -= (grown - width) / 2;
      width = grown;
    } else {
      const grown = width / shape;
      top -= (grown - height) / 2;
      height = grown;
    }
    svg.setAttribute("viewBox", `${left} ${top} ${width} ${height}`);
    svg.replaceChildren(...hexes, ...lines, ...(marker === null ? [] : [marker]), ...marks);

    // The ground itself, where the panel is in relief. The camera is given the
    // window the SVG was just given, so the two are one view and a mark drawn in
    // the SVG sits on the ground it is about. Spec 4.5.9.
    relief.element.hidden = view === null;
    if (view !== null) {
      relief.render({
        cells: found,
        low,
        seaLevel,
        verdancy,
        reach,
        basis: [e1, e2],
        frame: { left, top, width, height },
      });
    }

    if (input.diameterKm !== null) {
      svg.append(
        scaleBar({
          kmPerUnit: stepKm(input.diameterKm, fine),
          hexKm: stepKm(input.diameterKm, fine),
          // The panel's own place for saying what its scales are, which is where
          // the height between two lines belongs as well. Spec 4.6.3.3.
          note: interval > 0 ? `contours ${trimZeros(interval)}` : undefined,
          // In the bottom left corner of the panel, under the readout that stands
          // in the top left of it. The patch is a hexagon, so its own corners are
          // empty ground and the bar stands clear of the hexes there. Spec 4.6.5.
          inset: 0.01,
          width,
          left,
          bottom: top + height,
        }),
      );
    }
  }

  // The patch is laid out to the proportions of the panel, so a panel that
  // changes shape is drawn again rather than left to the SVG to letterbox. The
  // globe watches its own element for the same reason.
  new ResizeObserver(() => {
    if (last !== null) render(last);
  }).observe(svg);

  return {
    element,
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

/**
 * A contour interval as short as it can be written. Heights are the unitless
 * figures the hex readout gives, so the interval is one of those and is shown to
 * however many places it actually has rather than to a fixed three. Ground flat
 * enough for an interval too small to write that way is given in exponent form
 * rather than rounded away to nothing.
 */
function trimZeros(step: number): string {
  const plain = step.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return Number(plain) === step ? plain : step.toExponential(0);
}

/** Hexagon outline for a lattice with steps e1 and e2, as in the grid's dual. */
function hexOffsets(e1: Pt2, e2: Pt2): readonly Pt2[] {
  const combine = (a: number, b: number): Pt2 => [
    (a * e1[0] + b * e2[0]) / 3,
    (a * e1[1] + b * e2[1]) / 3,
  ];
  return [combine(1, 1), combine(-1, 2), combine(-2, 1), combine(-1, -1), combine(1, -2), combine(2, -1)];
}
