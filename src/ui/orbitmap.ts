import type { Orbit, StarSystem } from "../gen/system";
import { valueFor } from "../gen/rng";
import type { SpectralClass } from "../gen/star";

/**
 * The system seen from outside: the star at the middle, the orbits as the paths
 * they are, and everything the system holds standing somewhere on its own.
 *
 * The companion to the strip of ui/orbits.ts rather than a replacement for it.
 * The strip says what is in what order and how far out, which is what a referee
 * reads; this says what the system looks like, which is what makes it a place
 * rather than a table.
 *
 * It turns. Dragging leans the plane over and swings it round, the wheel comes
 * in and out, shift and a drag moves it about, and a double click puts it back.
 * A system seen flat on is a diagram; seen at an angle it is a system, because
 * the lean is what says the paths are circles being looked across rather than
 * rings on a page.
 *
 * Not to scale, and it cannot be: the outer orbit is two hundred times the inner
 * one and a drawing honest about that is a dot in an empty circle. The radii go
 * as a low power of the distance, so the inner orbits stay apart and the outer
 * ones stay on the page, and every path with room for it says how far out it is.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** The drawing is square, in these units, and scaled to whatever it is given. */
const SIZE = 1000;
const CENTRE = SIZE / 2;
/** The innermost and outermost path, as a fraction of the half-width. */
const RING = { nearest: 0.15, furthest: 0.92 } as const;
/**
 * How hard the distances are squeezed. One would be true scale and unreadable;
 * a third is close to drawing each orbit a fixed step further out. This leaves
 * the inner system open and still lets the outer orbits read as further away.
 */
const SQUEEZE = 0.42;

/** Where the view starts: leant over far enough to read as a plane seen across. */
const HOME_VIEW = { tiltDeg: 58, spinDeg: 0, zoom: 1, panX: 0, panY: 0 };
const TILT_LIMITS = { flattest: 0, steepest: 86 } as const;
const ZOOM_LIMITS = { out: 0.55, in: 6 } as const;
/** A pointer that moved further than this was a drag, not a click. */
const DRAG_SLOP = 4;

const STAR_COLOUR: Readonly<Record<SpectralClass, string>> = {
  O: "#9db4ff",
  B: "#bcd0ff",
  A: "#e2e9ff",
  F: "#fbf6e8",
  G: "#ffe9a8",
  K: "#ffc073",
  M: "#ff8a5c",
};

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

export interface OrbitMap {
  readonly element: SVGSVGElement;
  render(system: StarSystem): void;
  /** A picture for the body in an orbit, given when it has been drawn. */
  setPicture(orbitIndex: number, png: string): void;
  setSelected(orbitIndex: number | null): void;
  onSelect(handler: (orbitIndex: number) => void): void;
  /** Back to the viewpoint a system opens at. */
  resetView(): void;
}

export function createOrbitMap(): OrbitMap {
  const svg = make("svg", { class: "orbitmap", tabindex: 0 });
  const planeLayer = make("g");
  const bodyLayer = make("g");
  const selectLayer = make("g");
  svg.append(planeLayer, bodyLayer, selectLayer);

  const handlers: ((orbitIndex: number) => void)[] = [];
  const pictures = new Map<number, string>();
  let shown: StarSystem | null = null;
  let places = new Map<number, { x: number; y: number; r: number }>();
  let selected: number | null = null;
  let view = { ...HOME_VIEW };

  /**
   * The window on the drawing. Its height is the drawing's own, and its width is
   * whatever the panel's shape asks for, so a wide panel shows more of the
   * system to either side rather than the same square with a margin down both
   * ends of it.
   */
  function showView(): void {
    const height = SIZE / view.zoom;
    const across = svg.clientWidth > 0 && svg.clientHeight > 0 ? svg.clientWidth / svg.clientHeight : 1;
    const width = height * across;
    svg.setAttribute(
      "viewBox",
      `${CENTRE - width / 2 + view.panX} ${CENTRE - height / 2 + view.panY} ${width} ${height}`,
    );
  }

  /** Where an orbit's path sits, as a radius in drawing units. */
  function radiusOf(orbit: Orbit, all: readonly Orbit[]): number {
    const near = all[0]!.au;
    const far = all.at(-1)!.au;
    const span = Math.pow(far, SQUEEZE) - Math.pow(near, SQUEEZE);
    // One orbit has nothing to be spaced against, so it goes in the middle of
    // the room rather than hard against the inside of it.
    if (span === 0) return CENTRE * ((RING.nearest + RING.furthest) / 2);
    const at = (Math.pow(orbit.au, SQUEEZE) - Math.pow(near, SQUEEZE)) / span;
    return CENTRE * (RING.nearest + at * (RING.furthest - RING.nearest));
  }

  /** Where a body stands on its path. Fixed by the seed, so it never jumps. */
  function angleOf(system: StarSystem, orbit: Orbit): number {
    return valueFor(`${system.seed}:where`, orbit.index) * Math.PI * 2 + radians(view.spinDeg);
  }

  /** The lean of the plane: 1 seen flat on, 0 seen edge on. */
  function leanOf(): number {
    return Math.cos(radians(view.tiltDeg));
  }

  /** A point on a path, leant over. Depth is which side of the star it is on. */
  function pointOn(radius: number, angle: number): { x: number; y: number; depth: number } {
    return {
      x: CENTRE + Math.cos(angle) * radius,
      y: CENTRE + Math.sin(angle) * radius * leanOf(),
      depth: Math.sin(angle),
    };
  }

  function drawSelection(): void {
    selectLayer.replaceChildren();
    if (selected === null) return;
    const at = places.get(selected);
    if (at === undefined) return;
    selectLayer.append(make("circle", { class: "map-select", cx: at.x, cy: at.y, r: at.r + 14 }));
  }

  function render(system: StarSystem): void {
    pictures.clear();
    shown = system;
    draw();
  }

  /** Everything, from wherever it is being looked at. */
  function draw(): void {
    const system = shown;
    planeLayer.replaceChildren();
    bodyLayer.replaceChildren();
    places = new Map();
    showView();
    if (system === null) return;
    const lean = leanOf();

    // The habitable zone, as the band of the plane it is.
    const habitable = system.orbits.filter((orbit) => orbit.habitable);
    if (habitable.length > 0) {
      const inner = radiusOf(habitable[0]!, system.orbits);
      const outer = radiusOf(habitable.at(-1)!, system.orbits);
      const middle = (inner + outer) / 2;
      planeLayer.append(
        make("ellipse", {
          class: "map-zone",
          cx: CENTRE,
          cy: CENTRE,
          rx: middle,
          ry: Math.max(1, middle * lean),
          "stroke-width": Math.max(26, outer - inner) + 18,
        }),
      );
    }

    for (const orbit of system.orbits) {
      const r = radiusOf(orbit, system.orbits);
      planeLayer.append(
        make("ellipse", {
          class: "map-path",
          cx: CENTRE,
          cy: CENTRE,
          rx: r,
          ry: Math.max(0.5, r * lean),
        }),
      );
      if (orbit.content.kind === "belt") drawBelt(system, orbit, r);
    }

    drawStars(system);
    drawBases(system);
    // Back to front, so a world on the far side of its star goes behind it.
    const order = [...system.orbits].sort(
      (a, b) => Math.sin(angleOf(system, a)) - Math.sin(angleOf(system, b)),
    );
    for (const orbit of order) drawBody(system, orbit);
    drawSelection();
  }

  /**
   * A belt, drawn as the belt it is: a few hundred rocks right round the path,
   * bunched towards the middle of the band, dimmer on the far side, with a gap
   * or two where a resonance has swept one clean.
   *
   * A ring of evenly spaced dots reads as a dotted line, which is what it was.
   */
  function drawBelt(system: StarSystem, orbit: Orbit, radius: number): void {
    const key = `${system.seed}:belt:${orbit.index}`;
    const gaps = [0, 1]
      .filter((i) => valueFor(`${key}:gap-there`, i) < 0.55)
      .map((i) => ({
        at: valueFor(`${key}:gap`, i) * Math.PI * 2,
        wide: 0.1 + valueFor(`${key}:gap-wide`, i) * 0.14,
      }));

    const group = make("g", { class: "map-belt" });
    for (let i = 0; i < 320; i++) {
      const angle = valueFor(`${key}:angle`, i) * Math.PI * 2 + radians(view.spinDeg);
      const swept = gaps.some((gap) => {
        const away = Math.abs(((angle - gap.at + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        return away > Math.PI * (1 - gap.wide);
      });
      if (swept) continue;
      // Across the band: two draws averaged, so the rocks bunch towards the
      // middle of it rather than spreading evenly out to both edges.
      const across = (valueFor(`${key}:across`, i) + valueFor(`${key}:across2`, i)) / 2 - 0.5;
      const at = pointOn(radius * (1 + across * 0.13), angle);
      group.append(
        make("circle", {
          class: "map-rock",
          cx: at.x,
          cy: at.y,
          r: 1.4 + valueFor(`${key}:size`, i) * 3.4,
          opacity:
            (0.35 + valueFor(`${key}:dim`, i) * 0.5) * (at.depth < 0 ? 0.7 : 1),
        }),
      );
    }
    planeLayer.append(group);
  }

  /**
   * The bases, marked on the body they are at. SystemSpec 4.7.
   *
   * A naval base is a station in orbit of the main world and a scout way station
   * is a field on it or a tender beside it. Neither is a body on the diagram, so
   * both are marks beside the world rather than things in their own orbits.
   */
  function drawBases(system: StarSystem): void {
    const { letter, orbitIndex } = system.bases;
    if (letter === "") return;
    const orbit = system.orbits.find((held) => held.index === orbitIndex);
    if (orbit === undefined) return;
    const at = pointOn(radiusOf(orbit, system.orbits), angleOf(system, orbit));
    const marks = [
      ...(letter === "N" || letter === "A" ? ["map-naval"] : []),
      ...(letter === "S" || letter === "A" ? ["map-scout"] : []),
    ];
    for (const [n, mark] of marks.entries()) {
      bodyLayer.append(
        make("circle", { class: `map-base ${mark}`, cx: at.x + 14 + n * 9, cy: at.y - 14, r: 3.2 }),
      );
    }
  }

  function drawStars(system: StarSystem): void {
    const { primary, companion, companionOrbit } = system.stars;
    bodyLayer.append(
      make("circle", {
        class: "map-star",
        cx: CENTRE,
        cy: CENTRE,
        r: 26,
        fill: STAR_COLOUR[primary.spectral],
      }),
    );
    if (companion === null) return;
    // A close companion rides beside the primary; a far one sits outside every
    // path. SystemSpec 2.4 allows nothing in between.
    const close = companionOrbit === "close";
    const at = close
      ? { x: CENTRE + 42, y: CENTRE }
      : pointOn(CENTRE * RING.furthest * 1.06, radians(view.spinDeg) + Math.PI * 1.5);
    bodyLayer.append(
      make("circle", {
        class: "map-star",
        cx: at.x,
        cy: at.y,
        r: close ? 16 : 20,
        fill: STAR_COLOUR[companion.spectral],
      }),
    );
  }

  function drawBody(system: StarSystem, orbit: Orbit): void {
    const content = orbit.content;
    const { x, y } = pointOn(radiusOf(orbit, system.orbits), angleOf(system, orbit));
    const r = sizeOf(orbit);
    places.set(orbit.index, { x, y, r });

    const group = make("g", { class: `map-body map-${content.kind}`, tabindex: 0 });
    group.setAttribute("role", "button");
    const title = make("title");
    title.textContent = `Orbit ${orbit.index}, ${orbit.au} AU`;
    group.append(title);
    group.append(make("circle", { class: "map-hit", cx: x, cy: y, r: Math.max(r + 12, 26) }));

    if (content.kind === "world" || content.kind === "giant") {
      const picture = pictures.get(orbit.index) ?? null;
      if (picture === null) {
        group.append(
          make("circle", {
            class: content.kind === "giant" ? "map-giant" : "map-world",
            cx: x,
            cy: y,
            r,
          }),
        );
      } else {
        const clip = `map-clip-${orbit.index}`;
        const path = make("clipPath", { id: clip });
        path.append(make("circle", { cx: x, cy: y, r }));
        group.append(
          path,
          make("image", {
            href: picture,
            x: x - r,
            y: y - r,
            width: r * 2,
            height: r * 2,
            "clip-path": `url(#${clip})`,
            preserveAspectRatio: "xMidYMid slice",
          }),
          make("circle", {
            class: content.kind === "world" && content.main ? "map-edge map-edge-main" : "map-edge",
            cx: x,
            cy: y,
            r,
          }),
        );
      }
      if (content.kind === "giant") {
        // The ring lies in the plane the system does, so it leans with it rather
        // than staying flat to the reader.
        group.append(
          make("ellipse", {
            class: "map-ring",
            cx: x,
            cy: y,
            rx: r * 1.75,
            ry: Math.max(1.5, r * 1.75 * leanOf()),
          }),
        );
      }
    } else if (content.kind === "empty") {
      group.append(make("circle", { class: "map-nothing", cx: x, cy: y, r: 4 }));
    }

    group.addEventListener("click", () => {
      // The click at the end of a drag is the drag finishing, not a choice of
      // what happened to be under the pointer when it stopped. One click is
      // swallowed, not every click until the next press.
      if (dragged) {
        dragged = false;
        return;
      }
      for (const handler of handlers) handler(orbit.index);
    });
    group.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      for (const handler of handlers) handler(orbit.index);
    });
    bodyLayer.append(group);
  }

  /** How big a body is drawn. Kind, not scale: a giant beside a world. */
  function sizeOf(orbit: Orbit): number {
    switch (orbit.content.kind) {
      case "giant":
        return 26;
      case "world":
        return orbit.content.main ? 22 : 16;
      default:
        return 6;
    }
  }

  /* Turning it round ------------------------------------------------------ */

/**
   * The press in hand, if there is one.
   *
   * `turning` is false until the pointer has moved further than the slop, and
   * nothing happens to the view before it does. That is what keeps a click a
   * click: the pointer is not captured until a drag is really under way, and a
   * captured pointer would send the click that ends it to this element rather
   * than to the body under the pointer, which is a body that could never be
   * selected by clicking it.
   */
  let press: {
    readonly fromX: number;
    readonly fromY: number;
    x: number;
    y: number;
    readonly pan: boolean;
    turning: boolean;
  } | null = null;
  /** Whether the click now arriving is the end of a drag. */
  let dragged = false;

  svg.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragged = false;
    press = {
      fromX: event.clientX,
      fromY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      pan: event.shiftKey,
      turning: false,
    };
  });

  svg.addEventListener("pointermove", (event) => {
    if (press === null) return;
    if (!press.turning) {
      // Measured from where the press began rather than added up along the way,
      // so the hand's own shake during a click never totals into a drag.
      const far = Math.hypot(event.clientX - press.fromX, event.clientY - press.fromY);
      if (far <= DRAG_SLOP) return;
      press.turning = true;
      svg.setPointerCapture(event.pointerId);
    }
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    press.x = event.clientX;
    press.y = event.clientY;
    if (press.pan) {
      // In drawing units, so a drag moves the same amount of system however far
      // in the view is and whatever the panel is sized at.
      const units = SIZE / view.zoom / Math.max(1, svg.clientWidth);
      view.panX -= dx * units;
      view.panY -= dy * units;
    } else {
      view.spinDeg += dx * 0.4;
      view.tiltDeg = Math.min(
        TILT_LIMITS.steepest,
        Math.max(TILT_LIMITS.flattest, view.tiltDeg + dy * 0.3),
      );
    }
    draw();
  });

  const letGo = (event: PointerEvent): void => {
    if (press === null) return;
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    // Held until after the click that ends the drag, so that click can be told
    // apart from a click on whatever the pointer happens to be over.
    dragged = press.turning;
    press = null;
  };
  svg.addEventListener("pointerup", letGo);
  svg.addEventListener("pointercancel", letGo);

  svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      view.zoom = Math.min(
        ZOOM_LIMITS.in,
        Math.max(ZOOM_LIMITS.out, view.zoom * Math.pow(0.999, event.deltaY)),
      );
      draw();
    },
    { passive: false },
  );

  function resetView(): void {
    view = { ...HOME_VIEW };
    draw();
  }

  svg.addEventListener("dblclick", resetView);

  // A panel that changes shape changes what the window on to the drawing is.
  new ResizeObserver(() => draw()).observe(svg);

  return {
    element: svg,
    render,
    setPicture(orbitIndex, png) {
      pictures.set(orbitIndex, png);
      draw();
    },
    setSelected(orbitIndex) {
      selected = orbitIndex;
      drawSelection();
    },
    onSelect(handler) {
      handlers.push(handler);
    },
    resetView,
  };
}
