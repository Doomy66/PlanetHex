import type { Grid } from "../grid/grid";
import { ICO_FACES } from "../grid/icosahedron";
import { heightColour } from "./colour";
import { ICO_EDGE_ANGLE, scaleBar, stepKm } from "./scale";
import { isIced, type IceCaps } from "../gen/ice";
import type { PoiKind } from "../poi";

/**
 * The flattened hex map: the twenty faces unfolded into the zigzag net.
 *
 * A cell on a face edge is drawn once per face it belongs to. Where two faces are
 * neighbours in the net those drawings land on top of each other, and where the
 * net is cut open the cell appears at both edges, which is what an unfolded net
 * should show.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const PAD = 0.12;
/**
 * A ring is drawn on the hex boundary itself, at the width of the seam between
 * one hex and the next. Spec 4.3.4.1: it colours the gap the hexes already leave
 * between them, so it neither covers the ground it is about nor spreads over the
 * hexes around it. Growing the ring outward instead reads as a blob at the sizes
 * a hex is actually drawn at.
 */
const RING = 1;
/**
 * How far in the map can be taken, as a multiple of the fitted view. Spec 4.3.6.
 * There is no matching limit outward: the fitted view is the whole world, and
 * pulling further out only shrinks it inside a panel it already fits.
 */
const MAX_ZOOM = 40;
/** A pointer that moved further than this was a drag, not a click. */
const DRAG_SLOP_PX = 4;
/** A hex seam, as a fraction of the distance between two hex centres. */
const SEAM = 0.15;

/** The least a mark on the map may be drawn at, so it is visible at any level. */
const MARK_MIN_PX = 1.3;

/**
 * The widths the map draws its lines at, in map units, for a level drawn at so
 * many pixels per map unit. Spec 4.3.7.
 *
 * A seam is a fraction of a hex, so it holds its proportion at every level, and
 * `smooth` is what drops it: the reader says whether they are looking at a hex map
 * or at the ground it covers. A mark - the selection, a point of interest - keeps
 * that fraction as its width but is floored at something visible, since a seam
 * nobody can see costs nothing and a selection nobody can see is a panel that
 * will not say what is selected.
 *
 * Written out here rather than inside the panel because the pictures of 6.4.5 are
 * drawn at their own width, on a map that was never on screen to be measured, and
 * both have to draw the same map.
 */
export function strokeWidths(
  size: number,
  perUnit: number,
  smooth = false,
): { seam: number; mark: number } {
  const fraction = SEAM / size;
  return {
    seam: smooth ? 0 : fraction,
    mark: perUnit > 0 ? Math.max(fraction, MARK_MIN_PX / perUnit) : fraction,
  };
}

/** Wheel notches to zoom, tuned so one notch is a comfortable step. */
const WHEEL_RATE = 0.0015;

/** A hex the map should mark as carrying a point of interest. Spec 5.5. */
export interface PoiMark {
  readonly cell: number;
  readonly kind: PoiKind;
}

export interface HexMap {
  readonly element: SVGSVGElement;
  render(
    grid: Grid,
    heights: Float64Array,
    seaLevel: number,
    diameterKm: number | null,
    caps: IceCaps | null,
    /** How green the land is drawn, from 0 for bare to 1 for an Earth. Spec 5.6. */
    verdancy: number,
  ): void;
  setSelected(cell: number | null): void;
  /**
   * Draw the ground without the seams between its hexes, or with them. Spec
   * 4.3.7.1. A seam is a width rather than a shape, so this changes one number and
   * the map that is already drawn answers to it: nothing is built again.
   */
  setSmooth(on: boolean): void;
  /** Back to the whole net, fitted to the panel. Spec 4.3.6.2. */
  resetView(): void;
  /** The hexes carrying a POI, marked in the colour of their kind. Spec 5.5. */
  setPois(marks: readonly PoiMark[]): void;
  onSelect(handler: (cell: number) => void): void;
  /** The hex under the pointer, and null when the pointer leaves the hexes. */
  onHover(handler: (cell: number | null) => void): void;
}

export function createHexMap(): HexMap {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "hexmap");
  const hexLayer = document.createElementNS(SVG_NS, "g");
  const faceLayer = document.createElementNS(SVG_NS, "g");
  const poiLayer = document.createElementNS(SVG_NS, "g");
  const selectLayer = document.createElementNS(SVG_NS, "g");
  const scaleLayer = document.createElementNS(SVG_NS, "g");
  svg.append(hexLayer, faceLayer, poiLayer, selectLayer, scaleLayer);

  let handlers: ((cell: number) => void)[] = [];
  let hoverHandlers: ((cell: number | null) => void)[] = [];
  let placementsByCell = new Map<number, { x: number; y: number }[]>();
  let hexOutline: readonly (readonly [number, number])[] = [];
  let hovered: number | null = null;
  // Held rather than drawn and forgotten, since a rebuild at another detail level
  // throws away the hexes the marks were drawn over. Spec 6.6.
  let poiMarks: readonly PoiMark[] = [];
  /** The whole net, fitted to the panel: the view zoomed all the way out. */
  let base = { x: 0, y: 0, w: 1, h: 1 };
  /** What is on screen now, which is `base` until the user zooms or pans. */
  let view = { ...base };
  /** False until the first render, which is what fits the net to the panel. */
  let framed = false;
  /** What the scale bar needs, held so it can be redrawn as the view moves. */
  let scaleOf: { kmPerUnit: number; hexKm: number } | null = null;

  /** Where a pointer event landed, in map units. */
  function pointAt(event: MouseEvent): [number, number] | null {
    const ctm = svg.getScreenCTM?.();
    if (!ctm) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return [p.x, p.y];
  }

  /** The level last drawn, since the seams of 4.3.7 are a fraction of its hexes. */
  let drawnSize = 0;
  /** Whether the reader has asked for the ground without the hexes. Spec 4.3.7.1. */
  let smooth = false;

  /** The widths of 4.3.7, at whatever size the panel is drawing the map. */
  function drawStrokes(): void {
    if (drawnSize === 0) return;
    const across = svg.clientWidth;
    const perUnit = across > 0 && view.w > 0 ? across / view.w : 0;
    const { seam, mark } = strokeWidths(drawnSize, perUnit, smooth);
    svg.style.setProperty("--hex-stroke", String(seam));
    svg.style.setProperty("--mark-stroke", String(mark));
  }

  // The panel's own width is half of what decides the seams, so a panel that
  // changes shape has them worked out again. The map itself is drawn in map units
  // and does not need redrawing for it.
  new ResizeObserver(drawStrokes).observe(svg);

  /**
   * Puts a view on screen, held inside the fitted view first. Spec 4.3.6.1: the
   * map cannot be pulled out past the whole world, and cannot be pushed off the
   * side of the panel, so there is no way to end up looking at nothing.
   */
  function show(next: { x: number; y: number; w: number; h: number }): void {
    const w = Math.min(base.w, next.w);
    const h = Math.min(base.h, next.h);
    view = {
      w,
      h,
      x: Math.min(Math.max(next.x, base.x), base.x + base.w - w),
      y: Math.min(Math.max(next.y, base.y), base.y + base.h - h),
    };
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
    drawScale();
    // The seams follow the zoom as well as the level, since what decides them is
    // how large a hex is on screen. Spec 4.3.4.2.
    drawStrokes();
  }

  /**
   * Zooms about a point, so whatever is under the pointer stays under it. The
   * fitted view is the floor, since 4.3.6.1 has nothing further out to show.
   */
  function zoomAt(factor: number, at: [number, number]): void {
    const w = Math.min(base.w, Math.max(base.w / MAX_ZOOM, view.w / factor));
    const k = w / view.w;
    show({
      x: at[0] - (at[0] - view.x) * k,
      y: at[1] - (at[1] - view.y) * k,
      w,
      h: view.h * k,
    });
  }

  svg.addEventListener(
    "wheel",
    (event) => {
      const at = pointAt(event);
      if (!at) return;
      // Or the page scrolls under the map as well as the map zooming.
      event.preventDefault();
      zoomAt(Math.exp(-event.deltaY * WHEEL_RATE), at);
    },
    { passive: false },
  );

  // Dragging the map moves it under the pointer. The grab is held in map units
  // and the view is moved to put it back under the pointer, so the point taken
  // hold of stays there however far the drag goes.
  let grab: { at: [number, number]; from: { x: number; y: number }; client: [number, number] } | null =
    null;
  let dragged = 0;

  svg.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const at = pointAt(event);
    if (!at) return;
    grab = { at, from: { x: view.x, y: view.y }, client: [event.clientX, event.clientY] };
    dragged = 0;
  });

  svg.addEventListener("pointerup", (event) => {
    if (grab && svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    grab = null;
    svg.classList.remove("dragging");
  });

  /** The cell a pointer event landed on, or null if it landed off the hexes. */
  const cellAt = (event: Event): number | null => {
    const attr = (event.target as Element).getAttribute?.("data-cell");
    return attr === null || attr === undefined ? null : Number(attr);
  };

  // A drag is not a click, so moving the map does not change the selection.
  svg.addEventListener("click", (event) => {
    if (dragged > DRAG_SLOP_PX) return;
    const id = cellAt(event);
    if (id === null) return;
    for (const h of handlers) h(id);
  });

  // Only on a change, so moving across one hex does not redraw the panels that
  // follow the pointer sixty times a second.
  function hover(cell: number | null): void {
    if (cell === hovered) return;
    hovered = cell;
    for (const h of hoverHandlers) h(cell);
  }

  svg.addEventListener("pointermove", (event) => {
    if (grab) {
      dragged = Math.max(
        dragged,
        Math.hypot(event.clientX - grab.client[0], event.clientY - grab.client[1]),
      );
      // Captured only once the pointer has moved, since a captured pointer hands
      // the click that follows to the map rather than to the hex under it, and a
      // click that has not moved is a selection.
      if (dragged > DRAG_SLOP_PX && !svg.hasPointerCapture(event.pointerId)) {
        svg.setPointerCapture(event.pointerId);
        svg.classList.add("dragging");
      }
      const ctm = svg.getScreenCTM?.();
      const k = ctm ? ctm.a : 1;
      show({
        ...view,
        x: grab.from.x - (event.clientX - grab.client[0]) / k,
        y: grab.from.y - (event.clientY - grab.client[1]) / k,
      });
      return;
    }
    hover(cellAt(event));
  });
  svg.addEventListener("pointerleave", () => hover(null));

  function render(
    grid: Grid,
    heights: Float64Array,
    seaLevel: number,
    diameterKm: number | null,
    caps: IceCaps | null,
    verdancy: number,
  ): void {
    // The net is the same size at every detail level, so a view the user has
    // zoomed in on survives the slider rather than being thrown away with the
    // grid it was taken over.
    base = { x: -PAD, y: -PAD, w: grid.netWidth + PAD * 2, h: grid.netHeight + PAD * 2 };
    if (!framed) {
      view = { ...base };
      framed = true;
    }
    drawnSize = grid.size;
    drawStrokes();
    const hexes: SVGPolygonElement[] = [];
    const outlines: SVGPolygonElement[] = [];
    placementsByCell = new Map();
    // Every face carries the same hexagon, turned to that face; the first one is
    // as good as any for drawing a ring around a hex.
    hexOutline = grid.net[0]!.hexOffsets;
    // The hexes under the pointer are about to be replaced, so what was hovered
    // is an index into a grid that has gone. The next move reports afresh.
    hovered = null;

    for (const face of grid.net) {
      const offsets = face.hexOffsets;
      for (const p of face.placements) {
        const points = offsets
          .map(([dx, dy]) => `${(p.x + dx).toFixed(5)},${(p.y + dy).toFixed(5)}`)
          .join(" ");
        const poly = document.createElementNS(SVG_NS, "polygon");
        poly.setAttribute("points", points);
        const iced = isIced(caps, grid.cells[p.cell]!.centre[1]);
        poly.setAttribute("fill", heightColour(heights[p.cell]!, seaLevel, iced, verdancy));
        poly.setAttribute("data-cell", String(p.cell));
        hexes.push(poly);
        const list = placementsByCell.get(p.cell);
        if (list) list.push({ x: p.x, y: p.y });
        else placementsByCell.set(p.cell, [{ x: p.x, y: p.y }]);
      }
    }

    // The twenty face outlines, drawn over the hexes the way the reference maps do.
    for (let f = 0; f < ICO_FACES.length; f++) {
      const tri = grid.net[f]!;
      const corners = cornerPositions(tri.placements, grid.size);
      const poly = document.createElementNS(SVG_NS, "polygon");
      poly.setAttribute("points", corners.map(([x, y]) => `${x},${y}`).join(" "));
      poly.setAttribute("class", "face-outline");
      outlines.push(poly);
    }

    hexLayer.replaceChildren(...hexes);
    faceLayer.replaceChildren(...outlines);
    selectLayer.replaceChildren();
    drawPois();
    // One net unit is one face edge, whatever the grid size.
    scaleOf =
      diameterKm === null
        ? null
        : {
            kmPerUnit: (ICO_EDGE_ANGLE * diameterKm) / 2,
            hexKm: stepKm(diameterKm, grid.size),
          };
    show(view);
  }

  /**
   * The scale bar, drawn against what is on screen rather than against the whole
   * net. Everything in it is sized from that width, so it holds its size on the
   * panel as the map is zoomed, and the round figure it shows follows the zoom:
   * 4.6.3 asks for a quarter of the panel, not a quarter of the world.
   */
  function drawScale(): void {
    scaleLayer.replaceChildren(
      ...(scaleOf === null
        ? []
        : [
            scaleBar({
              ...scaleOf,
              // Smaller than the local panel's. Both sit on their left edge, but
              // this is the busier panel and can afford the less furniture.
              // Spec 4.6.5.
              fontScale: 0.5,
              inset: 0.01,
              width: view.w,
              left: view.x,
              bottom: view.y + view.h,
            }),
          ]),
    );
  }

/**
   * A ring around a cell: the hexagon it is drawn as, grown about its centre, so
   * the ring surrounds the hex instead of being laid over the top of it. Spec
   * 4.3.4.1. A cell on a face edge is drawn once per face it appears on, as the
   * hexes under it are, so a mark on a seam appears at both edges of the net.
   */
  function ring(cell: number, grow: number, className: string): SVGPolygonElement[] {
    const rings: SVGPolygonElement[] = [];
    for (const at of placementsByCell.get(cell) ?? []) {
      const poly = document.createElementNS(SVG_NS, "polygon");
      poly.setAttribute(
        "points",
        hexOutline
          .map(([dx, dy]) => `${(at.x + dx * grow).toFixed(5)},${(at.y + dy * grow).toFixed(5)}`)
          .join(" "),
      );
      poly.setAttribute("class", className);
      rings.push(poly);
    }
    return rings;
  }

  /** Every hex carrying a POI, ringed in the colour of its kind. */
  function drawPois(): void {
    poiLayer.replaceChildren(
      ...poiMarks.flatMap(({ cell, kind }) => ring(cell, RING, `poi-hex poi-${kind}`)),
    );
  }

  function setPois(marks: readonly PoiMark[]): void {
    poiMarks = marks;
    drawPois();
  }

  function setSelected(cell: number | null): void {
    selectLayer.replaceChildren(...(cell === null ? [] : ring(cell, RING, "selected-hex")));
  }

  return {
    element: svg,
    render,
    setSelected,
    setSmooth(on) {
      smooth = on;
      drawStrokes();
    },
    setPois,
    resetView() {
      show(base);
    },
    onSelect(handler) {
      handlers = [...handlers, handler];
    },
    onHover(handler) {
      hoverHandlers = [...hoverHandlers, handler];
    },
  };
}

/** The three lattice corners of a face, which are its net triangle corners. */
function cornerPositions(
  placements: readonly { x: number; y: number }[],
  size: number,
): [number, number][] {
  const rowStart = (i: number) => (i * (i + 1)) / 2;
  const at = (index: number) => {
    const p = placements[index]!;
    return [p.x, p.y] as [number, number];
  };
  return [at(0), at(rowStart(size)), at(rowStart(size) + size)];
}
